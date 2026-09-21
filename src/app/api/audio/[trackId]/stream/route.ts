import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, route } from "@/lib/api";
import { buildAudioKey, storage } from "@/lib/storage";
import {
  mp3DurationSeconds,
  serverTtsEnabled,
  synthesize,
  TtsUnavailableError,
} from "@/lib/tts";
import { rescaleSegments } from "@/lib/tts/segment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La síntesis de un capítulo largo puede tardar.
export const maxDuration = 300;

/**
 * Entrega el audio de una pista. Si aún no existe, lo sintetiza y lo guarda,
 * de forma que la siguiente reproducción es inmediata. Soporta peticiones
 * por rangos, necesarias para que el navegador pueda buscar dentro del audio.
 */
export const GET = route(
  async (request: Request, { params }: { params: Promise<{ trackId: string }> }) => {
    const user = await requireUser();
    const { trackId } = await params;

    const track = await prisma.audioTrack.findFirst({
      where: { id: trackId, document: { userId: user.id } },
    });
    if (!track) return fail("No encontramos ese audio.", 404, "NOT_FOUND");

    if (!serverTtsEnabled()) {
      return fail(
        "La síntesis de voz en el servidor no está configurada. La aplicación usará la voz de tu dispositivo.",
        503,
        "TTS_UNAVAILABLE",
      );
    }

    let audioKey = track.audioKey;

    if (!audioKey || !(await storage.exists(audioKey))) {
      try {
        const result = await synthesize(track.script, user.preferredVoice);
        audioKey = buildAudioKey(track.documentId, track.id, result.extension);
        await storage.put(audioKey, result.audio, result.mime);

        const duration =
          mp3DurationSeconds(result.audio) ?? (track.estimatedSeconds || null);

        await prisma.audioTrack.update({
          where: { id: track.id },
          data: {
            audioKey,
            audioMime: result.mime,
            audioStatus: "READY",
            durationSeconds: duration,
            provider: result.provider,
            voice: result.voice,
            errorMessage: null,
          },
        });

        // Las marcas de tiempo se ajustan a la duración real del audio.
        if (duration) {
          const segments = await prisma.audioSegment.findMany({
            where: { trackId: track.id },
            orderBy: { position: "asc" },
          });
          const rescaled = rescaleSegments(segments, duration);
          await prisma.$transaction(
            rescaled.map((segment) =>
              prisma.audioSegment.update({
                where: { id: segment.id },
                data: { startMs: segment.startMs, endMs: segment.endMs },
              }),
            ),
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error desconocido generando el audio.";
        await prisma.audioTrack.update({
          where: { id: track.id },
          data: { audioStatus: "FAILED", errorMessage: message },
        });
        if (error instanceof TtsUnavailableError) {
          return fail(message, 503, "TTS_UNAVAILABLE");
        }
        return fail(
          "Estamos teniendo problemas al generar el audio. Puedes volver a intentarlo.",
          502,
          "TTS_FAILED",
        );
      }
    }

    const size = await storage.size(audioKey);
    const mime = track.audioMime ?? "audio/mpeg";
    const range = request.headers.get("range");

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match?.[2] ? Number.parseInt(match[2], 10) : size - 1;

      if (Number.isNaN(start) || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }

      const buffer = await storage.get(audioKey);
      const slice = buffer.subarray(start, Math.min(end, size - 1) + 1);
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(slice.length),
          "Content-Range": `bytes ${start}-${Math.min(end, size - 1)}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }

    const stream = await storage.stream(audioKey);
    return new Response(stream, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=86400",
      },
    });
  },
);
