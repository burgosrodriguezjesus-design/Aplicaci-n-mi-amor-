/**
 * Driver de almacenamiento compatible con S3 (Cloudflare R2, Supabase,
 * Backblaze B2, MinIO, el propio S3...).
 *
 * Hace falta porque ningun alojamiento gratuito da disco persistente: los
 * ficheros tienen que vivir fuera del servidor. Los planes gratuitos de R2
 * (10 GB) o Supabase (1 GB) sobran para unos apuntes.
 *
 * La firma SigV4 se hace aqui a mano, con node:crypto, en lugar de traer el
 * SDK de AWS: son cuarenta lineas y ahorra decenas de megas en la imagen.
 * Las credenciales solo existen en el servidor; nunca llegan al navegador.
 */
import "server-only";
import { createHash, createHmac } from "node:crypto";
import { env } from "../env";
import type { StorageDriver } from "./index";

const ALGORITMO = "AWS4-HMAC-SHA256";
const SERVICIO = "s3";

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/** Cada segmento de la clave se codifica, pero las barras se conservan. */
function encodePath(key: string) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (c) =>
      `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function firmar(opts: {
  method: string;
  key: string;
  payload: Buffer;
  contentType?: string;
}) {
  const { endpoint, bucket, region, accessKeyId, secretAccessKey } = env.storage.s3;
  const base = new URL(endpoint);
  // Direccionamiento por ruta: el unico que funciona en todos los proveedores.
  const ruta = `${base.pathname.replace(/\/$/, "")}/${bucket}/${encodePath(opts.key)}`;
  const url = new URL(ruta, base.origin);

  const ahora = new Date();
  const amzDate = ahora.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const fecha = amzDate.slice(0, 8);
  const hashCuerpo = sha256(opts.payload);

  const cabeceras: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": hashCuerpo,
    "x-amz-date": amzDate,
  };
  if (opts.contentType) cabeceras["content-type"] = opts.contentType;

  const nombres = Object.keys(cabeceras).sort();
  const canonicas = nombres.map((n) => `${n}:${cabeceras[n].trim()}\n`).join("");
  const firmadas = nombres.join(";");

  const peticionCanonica = [
    opts.method,
    url.pathname,
    "",
    canonicas,
    firmadas,
    hashCuerpo,
  ].join("\n");

  const ambito = `${fecha}/${region}/${SERVICIO}/aws4_request`;
  const aFirmar = [ALGORITMO, amzDate, ambito, sha256(peticionCanonica)].join("\n");

  const clave = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, fecha), region), SERVICIO), "aws4_request");
  const firma = createHmac("sha256", clave).update(aFirmar).digest("hex");

  return {
    url: url.toString(),
    headers: {
      ...cabeceras,
      Authorization:
        `${ALGORITMO} Credential=${accessKeyId}/${ambito}, ` +
        `SignedHeaders=${firmadas}, Signature=${firma}`,
    },
  };
}

async function pedir(opts: {
  method: string;
  key: string;
  payload?: Buffer;
  contentType?: string;
}) {
  const payload = opts.payload ?? Buffer.alloc(0);
  const { url, headers } = firmar({ ...opts, payload });
  const respuesta = await fetch(url, {
    method: opts.method,
    headers,
    body:
      opts.method === "GET" || opts.method === "HEAD"
        ? undefined
        : new Uint8Array(payload),
  });
  return respuesta;
}

function fallo(accion: string, respuesta: Response, key: string): never {
  throw new Error(
    `No se ha podido ${accion} «${key}» en el almacenamiento ` +
      `(${respuesta.status} ${respuesta.statusText}). Revisa STORAGE_S3_*.`,
  );
}

export const s3Driver: StorageDriver = {
  async put(key, data, contentType) {
    const respuesta = await pedir({ method: "PUT", key, payload: data, contentType });
    if (!respuesta.ok) fallo("guardar", respuesta, key);
  },

  async get(key) {
    const respuesta = await pedir({ method: "GET", key });
    if (!respuesta.ok) fallo("leer", respuesta, key);
    return Buffer.from(await respuesta.arrayBuffer());
  },

  async stream(key) {
    const respuesta = await pedir({ method: "GET", key });
    if (!respuesta.ok || !respuesta.body) fallo("leer", respuesta, key);
    return respuesta.body;
  },

  async size(key) {
    const respuesta = await pedir({ method: "HEAD", key });
    if (!respuesta.ok) fallo("medir", respuesta, key);
    return Number(respuesta.headers.get("content-length") ?? 0);
  },

  async delete(key) {
    const respuesta = await pedir({ method: "DELETE", key });
    // 404 al borrar algo que ya no esta no es un error.
    if (!respuesta.ok && respuesta.status !== 404) fallo("borrar", respuesta, key);
  },

  async exists(key) {
    const respuesta = await pedir({ method: "HEAD", key });
    return respuesta.ok;
  },
};

/** Se usa al arrancar para avisar pronto si falta algo, no al subir el primer PDF. */
export function s3Configurado(): string | null {
  const { endpoint, bucket, accessKeyId, secretAccessKey } = env.storage.s3;
  const faltan = [
    !endpoint && "STORAGE_S3_ENDPOINT",
    !bucket && "STORAGE_S3_BUCKET",
    !accessKeyId && "STORAGE_S3_ACCESS_KEY_ID",
    !secretAccessKey && "STORAGE_S3_SECRET_ACCESS_KEY",
  ].filter(Boolean);
  return faltan.length ? `Falta configurar ${faltan.join(", ")}.` : null;
}
