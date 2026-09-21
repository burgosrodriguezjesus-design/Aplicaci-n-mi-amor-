/**
 * Configuracion centralizada leida de variables de entorno.
 *
 * Regla de oro: este modulo SOLO se importa desde codigo de servidor.
 * Ninguna clave de API se expone jamas al cliente.
 */
import "server-only";

function str(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function int(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const authSecret = str("AUTH_SECRET");

if (!authSecret && process.env.NODE_ENV === "production") {
  throw new Error(
    "Falta AUTH_SECRET. Genera uno con `openssl rand -base64 48` y anadelo al entorno.",
  );
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  authSecret: authSecret || "estudia-desarrollo-secreto-no-usar-en-produccion",

  ai: {
    apiKey: str("ANTHROPIC_API_KEY"),
    model: str("AI_MODEL", "claude-opus-5"),
    deepModel: str("AI_MODEL_DEEP", str("AI_MODEL", "claude-opus-5")),
    get enabled() {
      return Boolean(str("ANTHROPIC_API_KEY"));
    },
  },

  tts: {
    provider: str("TTS_PROVIDER", "none").toLowerCase() as
      | "none"
      | "openai"
      | "elevenlabs",
    openai: {
      apiKey: str("OPENAI_API_KEY"),
      model: str("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
      voice: str("OPENAI_TTS_VOICE", "alloy"),
    },
    elevenlabs: {
      apiKey: str("ELEVENLABS_API_KEY"),
      voiceId: str("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),
      model: str("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
    },
  },

  storage: {
    driver: str("STORAGE_DRIVER", "local"),
    dir: str("STORAGE_DIR", "./storage"),
  },

  limits: {
    maxUploadBytes: int("MAX_UPLOAD_MB", 50) * 1024 * 1024,
    maxUploadMb: int("MAX_UPLOAD_MB", 50),
    maxPages: int("MAX_PDF_PAGES", 1200),
  },
} as const;

/** Resumen de capacidades que SI puede conocer el cliente (sin secretos). */
export function publicCapabilities() {
  return {
    aiEnabled: env.ai.enabled,
    serverTts: env.tts.provider !== "none",
    maxUploadMb: env.limits.maxUploadMb,
    maxPages: env.limits.maxPages,
  };
}
