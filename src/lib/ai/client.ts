/**
 * Cliente de IA (Anthropic). Todo ocurre en el servidor: la clave nunca sale
 * de aqui. Si no hay clave configurada, `getAnthropic()` devuelve null y el
 * resto de la aplicacion usa el modo extractivo sin IA.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

let cached: Anthropic | null | undefined;

export function getAnthropic(): Anthropic | null {
  if (cached !== undefined) return cached;
  cached = env.ai.enabled ? new Anthropic({ apiKey: env.ai.apiKey }) : null;
  return cached;
}

export class AiUnavailableError extends Error {
  code = "AI_UNAVAILABLE";
  constructor() {
    super("No hay ninguna clave de IA configurada (ANTHROPIC_API_KEY).");
  }
}

export type CompleteOptions = {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  /** low | medium | high | xhigh | max. Controla profundidad y coste. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Cachea el prompt de sistema entre llamadas del mismo documento. */
  cacheSystem?: boolean;
};

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 529]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Una llamada de texto a texto, en streaming (evita timeouts con salidas
 * largas) y con reintentos con espera exponencial ante errores transitorios.
 */
export async function complete(options: CompleteOptions): Promise<string> {
  const client = getAnthropic();
  if (!client) throw new AiUnavailableError();

  const {
    system,
    user,
    maxTokens = 16000,
    model = env.ai.model,
    effort,
    cacheSystem = true,
  } = options;

  const maxAttempts = 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        ...(effort ? { output_config: { effort } } : {}),
        system: [
          {
            type: "text" as const,
            text: system,
            ...(cacheSystem ? { cache_control: { type: "ephemeral" as const } } : {}),
          },
        ],
        messages: [{ role: "user", content: user }],
      });

      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        throw new Error(
          "El modelo ha rechazado procesar este contenido. Revisa el documento.",
        );
      }

      return message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
    } catch (error) {
      lastError = error;
      const status =
        error instanceof Anthropic.APIError ? error.status : undefined;
      const retryable =
        error instanceof Anthropic.APIConnectionError ||
        (typeof status === "number" && RETRYABLE_STATUS.has(status));

      if (!retryable || attempt === maxAttempts) break;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Error desconocido llamando al modelo de IA.");
}

/**
 * Extrae el primer objeto/array JSON de una respuesta, tolerando que el
 * modelo lo envuelva en ```json ... ``` o anada texto alrededor.
 */
export function parseJsonLoose<T>(raw: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidates = [fenced?.[1], raw].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      /* seguimos probando */
    }
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf("]"), trimmed.lastIndexOf("}"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        /* nada que hacer */
      }
    }
  }
  return null;
}
