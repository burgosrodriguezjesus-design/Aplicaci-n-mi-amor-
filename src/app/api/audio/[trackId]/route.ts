import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Guion y segmentos de una pista concreta.
 *
 * El detalle del documento no los incluye a propósito: un temario completo
 * tiene miles de frases y se cargarían de golpe. Aquí se piden solo los de la
 * pista que se va a escuchar.
 */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ trackId: string }> }) => {
    const user = await requireUser();
    const { trackId } = await params;

    const track = await prisma.audioTrack.findFirst({
      where: { id: trackId, document: { userId: user.id } },
      include: { segments: { orderBy: { position: "asc" } } },
    });
    if (!track) return fail("No encontramos ese audio.", 404, "NOT_FOUND");

    return ok({
      track: {
        id: track.id,
        source: track.source,
        position: track.position,
        title: track.title,
        chapter: track.chapter,
        estimatedSeconds: track.estimatedSeconds,
        durationSeconds: track.durationSeconds,
        audioStatus: track.audioStatus,
        charCount: track.charCount,
        segmentCount: track.segments.length,
        script: track.script,
        segments: track.segments.map((segment) => ({
          id: segment.id,
          position: segment.position,
          text: segment.text,
          startMs: segment.startMs,
          endMs: segment.endMs,
          pageNumber: segment.pageNumber,
          summarySectionId: segment.summarySectionId,
        })),
      },
    });
  },
);
