import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, route } from "@/lib/api";
import { env } from "@/lib/env";
import { promptDeSistema, responder } from "@/lib/ai/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Una respuesta larga (con búsqueda web) puede tardar un par de minutos.
export const maxDuration = 300;

const schema = z.object({
  mensajes: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(12_000),
      }),
    )
    .min(1)
    .max(60),
  documentId: z.string().max(64).nullable().optional(),
});

/**
 * Conversación con el asistente. Responde en streaming, una línea JSON por
 * evento: {"t":"texto","v":"…"}, {"t":"buscando"}, {"t":"fin"} o
 * {"t":"error","v":"mensaje"}.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = schema.parse(await request.json());
  if (!env.ai.enabled) {
    return fail("El asistente de IA no está activado todavía.", 503, "AI_UNAVAILABLE");
  }

  // Solo los últimos mensajes (y siempre empezando por una pregunta).
  let mensajes = body.mensajes.slice(-30);
  while (mensajes.length && mensajes[0].role !== "user") mensajes = mensajes.slice(1);
  if (!mensajes.length || mensajes[mensajes.length - 1].role !== "user") {
    return fail("Falta la pregunta.", 422, "VALIDATION_ERROR");
  }

  let documento: { titulo: string; resumen: string } | null = null;
  if (body.documentId) {
    const doc = await prisma.document.findFirst({
      where: { id: body.documentId, userId: user.id },
      include: {
        summaries: {
          where: { isCurrent: true },
          take: 1,
          include: { sections: { orderBy: { position: "asc" }, select: { markdown: true } } },
        },
      },
    });
    if (!doc) return fail("No encontramos ese documento.", 404, "NOT_FOUND");
    documento = {
      titulo: doc.title,
      resumen: (doc.summaries[0]?.sections ?? []).map((s) => s.markdown).join("\n\n"),
    };
  }

  const sistema = promptDeSistema({ nombre: user.name, nivel: user.educationLevel, documento });
  const codificador = new TextEncoder();

  const cuerpo = new ReadableStream<Uint8Array>({
    async start(control) {
      const enviar = (evento: Record<string, string>) => {
        try {
          control.enqueue(codificador.encode(JSON.stringify(evento) + "\n"));
        } catch {
          // El navegador ya cerró la conexión.
        }
      };
      try {
        const { texto, rechazada } = await responder({
          mensajes,
          sistema,
          alEscribir: (v) => enviar({ t: "texto", v }),
          alBuscar: () => enviar({ t: "buscando" }),
          senal: request.signal,
        });
        if (rechazada && !texto.trim()) {
          enviar({ t: "error", v: "No puedo ayudarte con esa pregunta. Prueba a plantearla de otra forma." });
        }
        enviar({ t: "fin" });
      } catch (error) {
        if (!request.signal.aborted) {
          const mensaje =
            error instanceof Anthropic.RateLimitError
              ? "Hay muchas preguntas a la vez. Espera un momento y vuelve a intentarlo."
              : error instanceof Anthropic.AuthenticationError
                ? "La clave de IA del servidor no es válida. Revísala en la configuración."
                : error instanceof Anthropic.APIConnectionError
                  ? "No se ha podido conectar con el servicio de IA. Inténtalo de nuevo."
                  : "Ha habido un problema al responder. Inténtalo de nuevo.";
          enviar({ t: "error", v: mensaje });
        }
      } finally {
        try {
          control.close();
        } catch {
          // Ya estaba cerrada.
        }
      }
    },
  });

  return new Response(cuerpo, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
});
