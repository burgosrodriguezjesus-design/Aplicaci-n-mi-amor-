/**
 * Almacenamiento dentro de la propia base de datos.
 *
 * Existe para que publicar la aplicacion no obligue a crear **dos** cosas.
 * Con esto basta la base de datos: los PDF y el audio viven en una tabla, sin
 * almacen aparte, sin claves que copiar y sin cuentas en otros sitios.
 *
 * Los ficheros no son accesibles por ninguna URL: solo salen por las rutas
 * autenticadas de la aplicacion, igual que con el disco local.
 *
 * A cambio ocupan sitio en la base de datos. Para unos apuntes sobra; si algun
 * dia subes muchisimos libros, pasate a un almacen aparte (Vercel Blob o
 * cualquiera compatible con S3) cambiando una variable.
 */
import "server-only";
import { Readable } from "node:stream";
import { prisma } from "../db";
import type { StorageDriver } from "./index";

function noEncontrado(key: string): never {
  throw new Error(`No hemos encontrado «${key}» en el almacenamiento.`);
}

export const dbDriver: StorageDriver = {
  async put(key, data, contentType) {
    const fila = {
      contentType: contentType || "application/octet-stream",
      size: data.length,
      // Prisma espera un Uint8Array para los campos de bytes.
      data: new Uint8Array(data),
    };
    await prisma.storedFile.upsert({
      where: { key },
      create: { key, ...fila },
      update: fila,
    });
  },

  async get(key) {
    const fila = await prisma.storedFile.findUnique({
      where: { key },
      select: { data: true },
    });
    if (!fila) noEncontrado(key);
    return Buffer.from(fila.data);
  },

  async stream(key) {
    const datos = await this.get(key);
    return Readable.toWeb(Readable.from(datos)) as ReadableStream<Uint8Array>;
  },

  async size(key) {
    const fila = await prisma.storedFile.findUnique({
      where: { key },
      select: { size: true },
    });
    if (!fila) noEncontrado(key);
    return fila.size;
  },

  async delete(key) {
    // Borrar algo que ya no esta no es un error.
    await prisma.storedFile.deleteMany({ where: { key } });
  },

  /**
   * Solo el tramo pedido: la base de datos lo recorta y por la red viaja
   * ese trozo, no el PDF entero cada vez.
   */
  async getRange(key, inicio, fin) {
    const largo = Math.max(0, fin - inicio);
    let filas: { tramo: Uint8Array }[];
    try {
      filas = await prisma.$queryRaw<{ tramo: Uint8Array }[]>`
        SELECT substring("data" from ${inicio + 1}::int for ${largo}::int) AS tramo
        FROM "StoredFile" WHERE "key" = ${key}`;
    } catch {
      // Motor sin esa sintaxis (SQLite, al probar en casa): se lee entero.
      return (await this.get(key)).subarray(inicio, fin);
    }
    if (filas.length === 0) noEncontrado(key);
    return Buffer.from(filas[0].tramo);
  },

  async exists(key) {
    const fila = await prisma.storedFile.findUnique({
      where: { key },
      select: { key: true },
    });
    return fila !== null;
  },
};
