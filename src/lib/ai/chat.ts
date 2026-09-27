/**
 * «Pregúntale a alicIA» con IA (solo si el servidor tiene clave): responde
 * sobre un documento del estudiante, únicamente con lo que dice ese
 * documento. Sin clave, responde el motor sin IA (lib/preguntas/motor.ts).
 *
 * Responde en streaming (el texto aparece mientras se escribe) y, si el
 * modelo principal rechaza una pregunta, el propio servicio la reintenta con
 * otro modelo (fallbacks).
 * Todo ocurre en el servidor: la clave nunca llega al navegador.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { getAnthropic } from "./client";

export type MensajeChat = { role: "user" | "assistant"; content: string };

/** Contexto opcional: el resumen de uno de sus documentos. */
export type ContextoDocumento = { titulo: string; resumen: string };

/** Tope del resumen que se manda como contexto (caracteres). */
const MAXIMO_CONTEXTO = 120_000;

export function promptDeSistema(opts: { nombre?: string | null; nivel?: string | null; documento: ContextoDocumento }) {
  const resumen = opts.documento.resumen.slice(0, MAXIMO_CONTEXTO);
  const partes = [
    `Eres alicIA, el asistente de estudio del documento «${opts.documento.titulo}». Hablas en español, con un tono cercano, claro y profesional.`,
    "Respondes SOLO con la información de ese documento, que tienes debajo (su resumen fiel, con las páginas del PDF entre paréntesis). No uses conocimiento de fuera.",
    "Si la pregunta no se puede responder con el documento, dilo claramente («Eso no aparece en el documento») y sugiere algo que sí puedan preguntar. No inventes nada.",
    "Empieza por la respuesta y después da el detalle que haga falta. Cita la página cuando la sepas, por ejemplo (pág. 12). Usa listas, negritas y pasos numerados cuando ayuden a estudiar. Escribe las fórmulas en texto normal (por ejemplo: P = V × I).",
    "Si te piden preguntas de repaso o que les examines, hazlas solo con el contenido del documento y da las soluciones al final.",
  ];
  if (opts.nombre) partes.push(`El estudiante se llama ${opts.nombre}.`);
  if (opts.nivel) partes.push(`Nivel de estudios del estudiante: ${opts.nivel}. Adapta las explicaciones a ese nivel.`);
  partes.push(`<documento titulo="${opts.documento.titulo.replace(/"/g, "'")}">\n${resumen}\n</documento>`);
  return partes.join("\n\n");
}

/** ¿Admite el modelo el reintento automático en otro modelo si rechaza la pregunta? */
function admiteFallbacks(modelo: string) {
  return /^claude-(opus-5|fable-5)/.test(modelo);
}

export class ChatNoDisponibleError extends Error {
  code = "AI_UNAVAILABLE";
  constructor() {
    super("El asistente de IA no está activado: falta la clave de Anthropic en el servidor.");
  }
}

/**
 * Escribe la respuesta trozo a trozo con `alEscribir` y la devuelve entera.
 * `senal` permite cortarla si el estudiante pulsa «Parar».
 */
export async function responder(opts: {
  mensajes: MensajeChat[];
  sistema: string;
  alEscribir: (texto: string) => void;
  senal?: AbortSignal;
}): Promise<{ texto: string; rechazada: boolean }> {
  const client = getAnthropic();
  if (!client) throw new ChatNoDisponibleError();
  const modelo = env.ai.chatModel;

  const historial: Anthropic.Beta.BetaMessageParam[] = opts.mensajes.map((m) => ({ role: m.role, content: m.content }));
  let conExtras = true;
  let texto = "";

  // Un turno pausado ("pause_turn") se continúa mandando lo que ya lleva,
  // unas pocas veces como mucho.
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    try {
      const stream = client.beta.messages.stream(
        {
          model: modelo,
          max_tokens: 16000,
          output_config: { effort: "medium" },
          system: [{ type: "text", text: opts.sistema, cache_control: { type: "ephemeral" } }],
          messages: historial,
          ...(conExtras && admiteFallbacks(modelo)
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        },
        { signal: opts.senal },
      );
      stream.on("text", (delta) => {
        texto += delta;
        opts.alEscribir(delta);
      });
      const final = await stream.finalMessage();
      if (final.stop_reason === "pause_turn") {
        historial.push({ role: "assistant", content: final.content });
        continue;
      }
      return { texto, rechazada: final.stop_reason === "refusal" };
    } catch (error) {
      // Si la cuenta no admite el reintento en otro modelo, se pregunta sin
      // él (una vez) antes de rendirse.
      if (conExtras && !texto && error instanceof Anthropic.BadRequestError) {
        conExtras = false;
        vuelta--;
        continue;
      }
      throw error;
    }
  }
  return { texto, rechazada: false };
}
