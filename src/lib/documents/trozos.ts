/**
 * Subida por trozos.
 *
 * Vercel no deja que una peticion pase de 4,5 MB, y un PDF escaneado pesa
 * mucho mas: el servidor ni siquiera llegaba a verlo y el navegador recibia
 * un rechazo en texto plano ("Respuesta inesperada del servidor"). Por eso el
 * navegador lo parte en trozos pequeños, cada uno se guarda en el
 * almacenamiento, y al final se juntan y se tratan como una subida normal.
 *
 * Los trozos llevan el usuario en la clave: nadie puede tocar los de otro.
 */
import "server-only";
import { storage } from "@/lib/storage";

/** Tamaño de cada trozo: holgado por debajo de los 4,5 MB de Vercel. */
export const BYTES_POR_TROZO = 3 * 1024 * 1024;

const ID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function idDeSubidaValido(id: string) {
  return ID_VALIDO.test(id);
}

export function claveDeTrozo(userId: string, uploadId: string, parte: number) {
  return `uploads/${userId}/${uploadId}/${parte}`;
}

export function totalDeTrozos(bytes: number) {
  return Math.max(1, Math.ceil(bytes / BYTES_POR_TROZO));
}

/** Junta los trozos en orden. Falla si falta alguno. */
export async function juntarTrozos(userId: string, uploadId: string, partes: number) {
  const trozos: Buffer[] = [];
  for (let parte = 0; parte < partes; parte++) {
    const clave = claveDeTrozo(userId, uploadId, parte);
    if (!(await storage.exists(clave))) return null;
    trozos.push(await storage.get(clave));
  }
  return Buffer.concat(trozos);
}

export async function borrarTrozos(userId: string, uploadId: string, partes: number) {
  for (let parte = 0; parte < partes; parte++) {
    await storage.delete(claveDeTrozo(userId, uploadId, parte)).catch(() => undefined);
  }
}
