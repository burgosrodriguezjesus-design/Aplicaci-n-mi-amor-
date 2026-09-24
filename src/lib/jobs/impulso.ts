/**
 * Trabajo en segundo plano sin servidor.
 *
 * En Vercel no hay nada ejecutándose entre peticiones: el trabajo solo
 * avanzaba mientras la aplicación estaba abierta pidiéndolo. Aquí el servidor
 * se impulsa a sí mismo: cada ronda, al acabar, pide la siguiente (una
 * petición a su propia dirección), hasta que no queda nada. Así el documento
 * se termina aunque se cierre la aplicación.
 *
 * - Una cadena para la cola (extraer, analizar, resumir...).
 * - Hasta LECTORES cadenas para leer páginas escaneadas, pero solo si el
 *   dispositivo no las está leyendo ya (él es más rápido y no gasta el cupo
 *   gratuito de CPU del servidor).
 * - Las peticiones internas llevan una clave derivada del secreto de la app:
 *   nadie de fuera puede lanzar trabajo.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { prisma } from "../db";
import { claveDeFirma } from "../auth";
import { env } from "../env";
import { libre, MAX_INTENTOS } from "./ocr-repartido";

export const CABECERA = "x-alicia-impulso";
/** Lectores del servidor a la vez (cada uno es una petición con su CPU). */
export const LECTORES = 4;
/** Una cadena que no ha dado señales en este tiempo se da por muerta. */
const VIVA_MS = 90_000;

export async function claveInterna() {
  return createHmac("sha256", Buffer.from(await claveDeFirma()))
    .update("impulso")
    .digest("hex");
}

export async function esInterna(request: Request) {
  const recibida = request.headers.get(CABECERA) ?? "";
  const esperada = await claveInterna();
  return (
    recibida.length === esperada.length &&
    timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada))
  );
}

/** La dirección de la propia aplicación, sacada de la petición en curso. */
export function origenDe(request: Request) {
  return new URL(request.url).origin;
}

/**
 * Pide una ronda a la propia aplicación. La otra responde en seguida y
 * trabaja después, así que aquí apenas se espera.
 */
export async function siguiente(origen: string, tipo: "cola" | "ocr") {
  try {
    const cabeceras: Record<string, string> = { [CABECERA]: await claveInterna() };
    // Si el proyecto tiene la protección de despliegues de Vercel, esta clave
    // (la pone Vercel en cada despliegue) deja pasar las llamadas internas.
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) cabeceras["x-vercel-protection-bypass"] = bypass;
    await fetch(`${origen}/api/jobs/impulso?tipo=${tipo}`, {
      method: "POST",
      headers: cabeceras,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    /* si no llega, la siguiente visita de la app lo relanza */
  }
}

/** Lo mismo, pero cuando termine la petición en curso. */
export function lanzar(origen: string, tipo: "cola" | "ocr") {
  after(() => siguiente(origen, tipo));
}

/** Con un servidor normal la cola ya corre sola: esto solo hace falta sin él. */
function sinServidor() {
  return !env.jobs.background;
}

/* ── ¿Hay ya una cadena de la cola viva? ───────────────────────────── */

const CLAVE_COLA = "impulso-cola";

export async function marcarColaViva() {
  const ahora = String(Date.now());
  await prisma.setting.upsert({
    where: { key: CLAVE_COLA },
    create: { key: CLAVE_COLA, value: ahora },
    update: { value: ahora },
  });
}

export async function colaViva() {
  const fila = await prisma.setting.findUnique({ where: { key: CLAVE_COLA } });
  return fila !== null && Date.now() - Number(fila.value) < VIVA_MS;
}

export async function colaTerminada() {
  await prisma.setting.deleteMany({ where: { key: CLAVE_COLA } });
}

/** Arranca la cadena de la cola si no hay ninguna viva. */
export async function asegurarCola(origen: string) {
  if (!sinServidor() || (await colaViva())) return;
  await marcarColaViva();
  lanzar(origen, "cola");
}

/* ── Lectura de escaneadas en el servidor ──────────────────────────── */

const PENDIENTE = { source: "EMPTY", ocrIntentos: { lt: MAX_INTENTOS } };

/** ¿Está el dispositivo leyendo este documento ahora mismo? */
export async function dispositivoLeyendo(documentId?: string) {
  // El dispositivo reserva páginas nuevas cada pocos segundos: 30 s sin
  // hacerlo es que se ha cerrado la app.
  const reciente = new Date(Date.now() - 30_000);
  const fila = await prisma.documentPage.findFirst({
    where: {
      ...(documentId ? { documentId } : {}),
      ocrToken: { startsWith: "d:" },
      ocrReclamadaEn: { gt: reciente },
    },
    select: { id: true },
  });
  return fila !== null;
}

/**
 * Un documento con páginas escaneadas libres que el servidor pueda leer:
 * su PDF está en el servidor y ningún dispositivo lo está leyendo.
 */
export async function documentoParaServidor() {
  const libres = await prisma.documentPage.findMany({
    where: {
      ...PENDIENTE,
      ...libre(),
      document: { pdfEnDispositivo: false, status: { notIn: ["READY", "FAILED", "UPLOADING"] } },
    },
    distinct: ["documentId"],
    select: { document: { select: { id: true, storageKey: true, sizeBytes: true } } },
    take: 5,
  });
  for (const { document } of libres) {
    if (!(await dispositivoLeyendo(document.id))) return document;
  }
  return null;
}

/** Lectores del servidor trabajando ahora (reservas recientes suyas). */
async function lectoresActivos() {
  const reciente = new Date(Date.now() - 60_000);
  const filas = await prisma.documentPage.findMany({
    where: { ocrToken: { startsWith: "s:" }, ocrReclamadaEn: { gt: reciente } },
    distinct: ["ocrToken"],
    select: { ocrToken: true },
  });
  return filas.length;
}

/** Arranca lectores del servidor si hay páginas que nadie está leyendo. */
export async function asegurarLectores(origen: string) {
  if (!sinServidor() || !(await documentoParaServidor())) return;
  const faltan = LECTORES - (await lectoresActivos());
  for (let i = 0; i < faltan; i++) lanzar(origen, "ocr");
}
