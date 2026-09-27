import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth";
import { fail, route } from "@/lib/api";
import { env } from "@/lib/env";
import { promptDeSistema, responder } from "@/lib/ai/chat";
import { responderSinIa } from "@/lib/preguntas/motor";
import { cargarDocumento } from "@/lib/preguntas/documento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Con IA, una respuesta larga puede tardar; sin IA es inmediata.
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
  documentId: z.string().min(1, "Elige un documento.").max(64),
});

/**
 * Preguntas sobre un documento del estudiante: solo sobre lo que dice ese
 * documento. Responde en streaming, una línea JSON por evento:
 * {"t":"texto","v":"…"}, {"t":"fin"} o {"t":"error","v":"mensaje"}.
 *
 * Funciona siempre, sin activar nada: sin clave de IA responde el motor que
 * busca en el propio documento; con clave, la IA (limitada al documento).
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = schema.parse(await request.json());

  let mensajes = body.mensajes.slice(-30);
  while (mensajes.length && mensajes[0].role !== "user") mensajes = mensajes.slice(1);
  if (!mensajes.length || mensajes[mensajes.length - 1].role !== "user") {
    return fail("Falta la pregunta.", 422, "VALIDATION_ERROR");
  }

  const cargado = await cargarDocumento(user.id, body.documentId);
  if (!cargado) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

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
        if (!env.ai.enabled) {
          // Sin IA: la respuesta sale del propio documento, al momento. Se
          // manda por líneas para que se vea aparecer.
          const preguntas = mensajes.filter((m) => m.role === "user").map((m) => m.content);
          const respuesta = responderSinIa(cargado.documento, preguntas[preguntas.length - 1], preguntas.slice(0, -1));
          const lineas = respuesta.split(/(?<=\n)/);
          for (const linea of lineas) {
            if (request.signal.aborted) break;
            enviar({ t: "texto", v: linea });
            if (lineas.length > 1) await new Promise((r) => setTimeout(r, 25));
          }
        } else {
          const sistema = promptDeSistema({
            nombre: user.name,
            nivel: user.educationLevel,
            documento: { titulo: cargado.documento.titulo, resumen: cargado.resumen },
          });
          const { texto, rechazada } = await responder({
            mensajes,
            sistema,
            alEscribir: (v) => enviar({ t: "texto", v }),
            senal: request.signal,
          });
          if (rechazada && !texto.trim()) {
            enviar({ t: "error", v: "No puedo ayudarte con esa pregunta. Prueba a plantearla de otra forma." });
          }
        }
        enviar({ t: "fin" });
      } catch (error) {
        if (!request.signal.aborted) {
          const mensaje =
            error instanceof Anthropic.RateLimitError
              ? "Hay muchas preguntas a la vez. Espera un momento y vuelve a intentarlo."
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
