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

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return !/^(0|false|no)$/i.test(value);
}

const authSecret = str("AUTH_SECRET");

/**
 * Direccion de la base de datos.
 *
 * Vercel, cuando creas la base de datos desde su panel, inyecta la variable
 * con otros nombres. Se aceptan todos para que no haya que copiar nada a mano.
 */
export const NOMBRES_BASE_DE_DATOS = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "NEON_DATABASE_URL",
  "POSTGRES_URL_NO_SSL",
] as const;

/** Que nombres de esos estan puestos. Solo los nombres, nunca los valores. */
export function nombresDeBaseDeDatosVistos(): string[] {
  return NOMBRES_BASE_DE_DATOS.filter((nombre) => str(nombre) !== "");
}

const EN_LA_NUBE = Boolean(
  process.env.VERCEL || process.env.RENDER || process.env.FLY_APP_NAME,
);

const ES_POSTGRES = /^postgres(ql)?:\/\//i;

/**
 * Elige la direccion de la base de datos entre todos los nombres posibles.
 *
 * No vale con coger la primera que exista: una `DATABASE_URL` vieja apuntando
 * a un fichero se colaba por delante de la base de datos de verdad que acababa
 * de conectar el alojamiento, y la aplicacion seguia diciendo que faltaba.
 * En la nube manda la que sea PostgreSQL, este en la variable que este.
 */
function databaseUrl() {
  const valores = NOMBRES_BASE_DE_DATOS.map((nombre) => str(nombre)).filter(Boolean);

  const postgres = valores.find((valor) => ES_POSTGRES.test(valor));
  if (postgres) return postgres;

  // En la nube no se cae a SQLite: un fichero no sobrevive, y fingir que hay
  // base de datos solo sirve para que el fallo llegue mas tarde y peor.
  if (EN_LA_NUBE) return "";
  return valores[0] ?? "file:./dev.db";
}

/**
 * Donde se guardan los PDF y el audio.
 *
 * Se decide solo, por lo que haya configurado, para que publicarla no exija
 * tocar variables: si Vercel ha puesto su almacenamiento, se usa ese; si hay
 * credenciales de S3, esas; y si no, el disco.
 */
function storageDriver() {
  const elegido = str("STORAGE_DRIVER");
  if (elegido) return elegido;
  if (str("BLOB_READ_WRITE_TOKEN")) return "blob";
  if (str("STORAGE_S3_ENDPOINT") && str("STORAGE_S3_BUCKET")) return "s3";
  // Con PostgreSQL no hay disco que dure, pero si base de datos: los ficheros
  // se guardan ahi y publicar la aplicacion no exige crear nada mas.
  if (/^postgres(ql)?:\/\//i.test(databaseUrl())) return "db";
  return "local";
}

// Prisma lee DATABASE_URL del entorno tal cual: se normaliza antes de que lo
// haga, para aceptar tambien los nombres que inyecta Vercel.
const direccionBaseDeDatos = databaseUrl();
if (direccionBaseDeDatos) process.env.DATABASE_URL = direccionBaseDeDatos;

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  /**
   * Vacio significa "generalo tu": se crea uno y se guarda en la base de
   * datos. Asi la aplicacion se puede publicar sin configurar nada, y el
   * secreto sigue siendo estable entre despliegues.
   */
  authSecret,

  ai: {
    apiKey: str("ANTHROPIC_API_KEY"),
    model: str("AI_MODEL", "claude-opus-5"),
    deepModel: str("AI_MODEL_DEEP", str("AI_MODEL", "claude-opus-5")),
    /** Fragmentos analizados en paralelo. Súbelo si tu cuenta admite más ritmo. */
    concurrency: Math.min(12, Math.max(1, int("AI_CONCURRENCY", 4))),
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
    // "local" guarda en disco; "s3" en cualquier servicio compatible con S3
    // (Cloudflare R2, Supabase, Backblaze B2...), que es lo que hace falta
    // cuando el alojamiento no tiene disco persistente.
    driver: storageDriver(),
    dir: str("STORAGE_DIR", "./storage"),
    s3: {
      endpoint: str("STORAGE_S3_ENDPOINT"),
      bucket: str("STORAGE_S3_BUCKET"),
      region: str("STORAGE_S3_REGION", "auto"),
      accessKeyId: str("STORAGE_S3_ACCESS_KEY_ID"),
      secretAccessKey: str("STORAGE_S3_SECRET_ACCESS_KEY"),
    },
  },

  jobs: {
    /**
     * Segundos de trabajo por rebanada. 0 = sin limite (un servidor normal,
     * que puede estar procesando minutos seguidos).
     *
     * En un alojamiento sin servidor -Vercel y parecidos- cada peticion se
     * corta a los 60 segundos, asi que el procesado se parte en rebanadas que
     * se encadenan solas. Ahi se pone 45 por defecto, que deja margen para
     * guardar y responder.
     */
    sliceSeconds: int("JOB_SLICE_SECONDS", process.env.VERCEL ? 45 : 0),
    /**
     * Si la cola puede correr en segundo plano tras responder una peticion.
     *
     * En un servidor normal, si. Donde no hay servidor, la funcion muere en
     * cuanto responde: arrancar una cola de fondo alli solo sirve para dejar
     * trabajos a medias marcados como "en curso". Ahi el trabajo avanza
     * unicamente por las rebanadas que pide la aplicacion.
     */
    background: bool("JOB_BACKGROUND", !process.env.VERCEL),
  },

  limits: {
    maxUploadBytes: int("MAX_UPLOAD_MB", 80) * 1024 * 1024,
    maxUploadMb: int("MAX_UPLOAD_MB", 80),
    maxPages: int("MAX_PDF_PAGES", 1500),
    ocrMaxPages: int("OCR_MAX_PAGES", 600),
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
