import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { speakify, estimateSeconds } from "@/lib/tts/speakify";
import { segmentScript } from "@/lib/tts/segment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({ source: z.enum(["DOCUMENT"]) });

/**
 * Genera el audiolibro del PDF completo (no del resumen), un capítulo por
 * apartado detectado. Se construye con el adaptador determinista a lenguaje
 * hablado, así que no consume IA: es texto literal del documento, solo dicho
 * de forma natural.
 */
export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const body = schema.parse(await request.json());

    const document = await prisma.document.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true },
    });
    if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

    const existing = await prisma.audioTrack.count({
      where: { documentId: id, source: body.source },
    });
    if (existing > 0) return ok({ created: 0, alreadyExists: true });

    const sections = await prisma.documentSection.findMany({
      where: { documentId: id },
      orderBy: { position: "asc" },
    });
    if (sections.length === 0) {
      return fail(
        "Todavía no hemos extraído el texto de este documento.",
        409,
        "NOT_PROCESSED",
      );
    }

    let created = 0;
    for (const section of sections) {
      // El contenido lleva marcas internas de página que no deben narrarse.
      const clean = section.content.replace(/\[\[pag\. \d+\]\]/g, "");
      const script = speakify(clean);
      if (!script.trim()) continue;

      const seconds = estimateSeconds(script);
      const segments = segmentScript(script, seconds);

      await prisma.audioTrack.create({
        data: {
          documentId: id,
          source: "DOCUMENT",
          position: section.position,
          title: section.title.slice(0, 300),
          chapter: section.title.slice(0, 300),
          script,
          charCount: script.length,
          estimatedSeconds: seconds,
          audioStatus: "PENDING",
          segments: {
            create: segments.map((segment) => ({
              position: segment.position,
              text: segment.text,
              displayText: segment.text,
              startChar: segment.startChar,
              endChar: segment.endChar,
              startMs: segment.startMs,
              endMs: segment.endMs,
              pageNumber: section.startPage,
            })),
          },
        },
      });
      created += 1;
    }

    return ok({ created });
  },
);
