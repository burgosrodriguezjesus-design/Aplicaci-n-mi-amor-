/**
 * «Pregúntale a alicIA»: un asistente de IA con el que hablar de cualquier
 * cosa, y además de los apuntes del estudiante si elige un documento.
 *
 * Responde en streaming (el texto aparece mientras se escribe), puede buscar
 * en internet para lo que es actual y, si el modelo principal rechaza una
 * pregunta, el propio servicio la reintenta con otro modelo (fallbacks).
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

export function promptDeSistema(opts: { nombre?: string | null; nivel?: string | null; documento?: ContextoDocumento | null }) {
  const partes = [
    "Eres alicIA, el asistente de una aplicación de estudio. Hablas en español, con un tono cercano, claro y profesional.",
    "Puedes ayudar con cualquier tema: dudas de cualquier asignatura, explicaciones paso a paso, ejercicios resueltos, técnicas de estudio, redacción, idiomas, programación, cultura general, organización del tiempo o cualquier otra pregunta.",
    "Explica bien pero sin rodeos: empieza por la respuesta y después da el detalle que haga falta. Usa listas, negritas y pasos numerados cuando ayuden a estudiar. Para fórmulas, escríbelas en texto normal (por ejemplo: P = V × I).",
    "Si algo depende de datos actuales (noticias, fechas, precios, normativa reciente), usa la búsqueda web y di de dónde sale. Si no sabes algo o no estás seguro, dilo en lugar de inventarlo.",
    "Si te piden resolver un ejercicio de clase, resuélvelo explicando el razonamiento para que el estudiante aprenda, no solo el resultado.",
  ];
  if (opts.nombre) partes.push(`El estudiante se llama ${opts.nombre}.`);
  if (opts.nivel) partes.push(`Nivel de estudios del estudiante: ${opts.nivel}. Adapta las explicaciones a ese nivel.`);
  if (opts.documento) {
    const resumen = opts.documento.resumen.slice(0, MAXIMO_CONTEXTO);
    partes.push(
      `El estudiante está estudiando el documento «${opts.documento.titulo}». Debajo tienes su resumen fiel (con las páginas del PDF entre paréntesis).`,
      "Cuando la pregunta sea sobre ese temario, básate en él, cita la página cuando la sepas y avisa si algo no aparece en el documento. Si la pregunta es de otra cosa, respóndela con normalidad.",
      `<documento titulo="${opts.documento.titulo.replace(/"/g, "'")}">\n${resumen}\n</documento>`,
    );
  }
  return partes.join("\n\n");
}

/** ¿Admite el modelo el reintento automático en otro modelo si rechaza la pregunta? */
function admiteFallbacks(modelo: string) {
  return /^claude-(opus-5|fable-5)/.test(modelo);
}

/** ¿Admite la búsqueda web con filtrado dinámico? */
function admiteBusqueda(modelo: string) {
  return /^claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable-5)/.test(modelo);
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
  alBuscar?: () => void;
  senal?: AbortSignal;
}): Promise<{ texto: string; rechazada: boolean }> {
  const client = getAnthropic();
  if (!client) throw new ChatNoDisponibleError();
  const modelo = env.ai.chatModel;

  const historial: Anthropic.Beta.BetaMessageParam[] = opts.mensajes.map((m) => ({ role: m.role, content: m.content }));
  let conExtras = true;
  let texto = "";

  // Una búsqueda web larga puede pausar el turno ("pause_turn"): se continúa
  // mandando lo que ya lleva, unas pocas veces como mucho.
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    try {
      const stream = client.beta.messages.stream(
        {
          model: modelo,
          max_tokens: 16000,
          output_config: { effort: "medium" },
          system: [{ type: "text", text: opts.sistema, cache_control: { type: "ephemeral" } }],
          messages: historial,
          ...(conExtras && admiteBusqueda(modelo)
            ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 3 }] }
            : {}),
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
      stream.on("streamEvent", (evento) => {
        if (evento.type === "content_block_start" && evento.content_block.type === "server_tool_use") opts.alBuscar?.();
      });
      const final = await stream.finalMessage();
      if (final.stop_reason === "pause_turn") {
        historial.push({ role: "assistant", content: final.content });
        continue;
      }
      return { texto, rechazada: final.stop_reason === "refusal" };
    } catch (error) {
      // Si la cuenta no tiene activada la búsqueda web o el reintento en otro
      // modelo, se pregunta sin ellos (una vez) antes de rendirse.
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
