/**
 * Síntesis de voz en el servidor.
 *
 * Proveedores soportados:
 *  - "none"       -> no se sintetiza nada en el servidor; el cliente usa la voz
 *                    del dispositivo (Web Speech API). No requiere claves.
 *  - "openai"     -> OPENAI_API_KEY
 *  - "elevenlabs" -> ELEVENLABS_API_KEY
 *
 * Las claves nunca salen del servidor: el navegador solo recibe el audio ya
 * generado a través de una ruta autenticada.
 */
import "server-only";
import { env } from "../env";

export type SynthesisResult = {
  audio: Buffer;
  mime: string;
  extension: string;
  provider: string;
  voice: string;
};

export class TtsUnavailableError extends Error {
  code = "TTS_UNAVAILABLE";
  constructor() {
    super("No hay proveedor de voz configurado en el servidor.");
  }
}

export class TtsFailedError extends Error {
  code = "TTS_FAILED";
  constructor(message: string) {
    super(message);
  }
}

export function serverTtsEnabled() {
  if (env.tts.provider === "openai") return Boolean(env.tts.openai.apiKey);
  if (env.tts.provider === "elevenlabs") return Boolean(env.tts.elevenlabs.apiKey);
  return false;
}

/** OpenAI admite ~4096 caracteres por petición: troceamos y concatenamos. */
const OPENAI_CHUNK = 3800;
const ELEVEN_CHUNK = 4500;

function splitForTts(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let buffer = "";
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    if (buffer && buffer.length + sentence.length > limit) {
      parts.push(buffer.trim());
      buffer = "";
    }
    buffer += (buffer ? " " : "") + sentence;
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) {
        const body = await response.text();
        throw new TtsFailedError(
          `El proveedor de voz devolvió ${response.status}: ${body.slice(0, 200)}`,
        );
      }
      lastError = new TtsFailedError(`El proveedor de voz devolvió ${response.status}`);
    } catch (error) {
      lastError = error;
      if (error instanceof TtsFailedError && !/50\d|429/.test(error.message)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new TtsFailedError("Error desconocido");
}

async function synthesizeOpenAi(text: string, voice: string): Promise<SynthesisResult> {
  const chunks = splitForTts(text, OPENAI_CHUNK);
  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    const response = await fetchWithRetry("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.tts.openai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.tts.openai.model,
        voice,
        input: chunk,
        response_format: "mp3",
      }),
    });
    buffers.push(Buffer.from(await response.arrayBuffer()));
  }

  return {
    audio: Buffer.concat(buffers),
    mime: "audio/mpeg",
    extension: "mp3",
    provider: "openai",
    voice,
  };
}

async function synthesizeElevenLabs(
  text: string,
  voiceId: string,
): Promise<SynthesisResult> {
  const chunks = splitForTts(text, ELEVEN_CHUNK);
  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    const response = await fetchWithRetry(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": env.tts.elevenlabs.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: chunk,
          model_id: env.tts.elevenlabs.model,
          voice_settings: { stability: 0.4, similarity_boost: 0.75 },
        }),
      },
    );
    buffers.push(Buffer.from(await response.arrayBuffer()));
  }

  return {
    audio: Buffer.concat(buffers),
    mime: "audio/mpeg",
    extension: "mp3",
    provider: "elevenlabs",
    voice: voiceId,
  };
}

export async function synthesize(
  text: string,
  voiceOverride?: string | null,
): Promise<SynthesisResult> {
  if (!text.trim()) throw new TtsFailedError("El guion está vacío.");

  if (env.tts.provider === "openai") {
    if (!env.tts.openai.apiKey) throw new TtsUnavailableError();
    return synthesizeOpenAi(text, voiceOverride || env.tts.openai.voice);
  }
  if (env.tts.provider === "elevenlabs") {
    if (!env.tts.elevenlabs.apiKey) throw new TtsUnavailableError();
    return synthesizeElevenLabs(text, voiceOverride || env.tts.elevenlabs.voiceId);
  }
  throw new TtsUnavailableError();
}

/**
 * Duración real de un MP3 a partir de sus cabeceras de trama.
 * Evita depender de librerías externas solo para saber cuánto dura.
 */
export function mp3DurationSeconds(buffer: Buffer): number | null {
  const BITRATES_V1_L3 = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
  ];
  const SAMPLE_RATES_V1 = [44100, 48000, 32000, 0];

  let offset = 0;
  let duration = 0;
  let frames = 0;

  // Saltamos una posible etiqueta ID3v2.
  if (buffer.length > 10 && buffer.toString("latin1", 0, 3) === "ID3") {
    const size =
      ((buffer[6] & 0x7f) << 21) |
      ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7) |
      (buffer[9] & 0x7f);
    offset = 10 + size;
  }

  while (offset + 4 <= buffer.length && frames < 200000) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const versionBits = (buffer[offset + 1] >> 3) & 0x03;
    const layerBits = (buffer[offset + 1] >> 1) & 0x03;
    const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
    const padding = (buffer[offset + 2] >> 1) & 0x01;

    // Solo MPEG-1 Layer III, que es lo que devuelven los proveedores.
    if (versionBits !== 3 || layerBits !== 1) {
      offset += 1;
      continue;
    }
    const bitrate = BITRATES_V1_L3[bitrateIndex] * 1000;
    const sampleRate = SAMPLE_RATES_V1[sampleRateIndex];
    if (!bitrate || !sampleRate) {
      offset += 1;
      continue;
    }

    const frameLength = Math.floor((144 * bitrate) / sampleRate) + padding;
    if (frameLength <= 0) break;

    duration += 1152 / sampleRate;
    frames += 1;
    offset += frameLength;
  }

  return frames > 0 ? Math.round(duration * 100) / 100 : null;
}
