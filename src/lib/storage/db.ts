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

/**
 * Un fichero "compuesto": en vez de sus bytes, guarda la lista de trozos que
 * lo forman. Así un PDF de 76 MB subido por trozos no se reescribe entero en
 * una sola fila (tardaba casi 20 s y en Vercel podía pasar del límite).
 */
const COMPUESTO = "application/x-alicia-compuesto";
type Indice = { contentType: string; partes: { key: string; size: number }[] };

async function leerIndice(key: string): Promise<Indice | null> {
  const fila = await prisma.storedFile.findUnique({
    where: { key },
    select: { contentType: true, data: true },
  });
  if (!fila || fila.contentType !== COMPUESTO) return null;
  return JSON.parse(Buffer.from(fila.data).toString("utf8")) as Indice;
}

async function tramoDeFila(key: string, inicio: number, largo: number): Promise<Buffer> {
  try {
    const filas = await prisma.$queryRaw<{ tramo: Uint8Array }[]>`
      SELECT substring("data" from ${inicio + 1}::int for ${largo}::int) AS tramo
      FROM "StoredFile" WHERE "key" = ${key}`;
    if (filas.length === 0) noEncontrado(key);
    return Buffer.from(filas[0].tramo);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No hemos encontrado")) throw error;
    // Motor sin esa sintaxis (SQLite, al probar en casa): se lee entero.
    const fila = await prisma.storedFile.findUnique({ where: { key }, select: { data: true } });
    if (!fila) noEncontrado(key);
    return Buffer.from(fila.data).subarray(inicio, inicio + largo);
  }
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
      select: { data: true, contentType: true },
    });
    if (!fila) noEncontrado(key);
    if (fila.contentType !== COMPUESTO) return Buffer.from(fila.data);
    const indice = JSON.parse(Buffer.from(fila.data).toString("utf8")) as Indice;
    const trozos: Buffer[] = [];
    for (const parte of indice.partes) trozos.push(await this.get(parte.key));
    return Buffer.concat(trozos);
  },

  async stream(key) {
    const indice = await leerIndice(key);
    if (!indice) {
      const datos = await this.get(key);
      return Readable.toWeb(Readable.from(datos)) as ReadableStream<Uint8Array>;
    }
    // Trozo a trozo: nunca todo el fichero en memoria.
    const leer = this.get.bind(this);
    async function* trozos() {
      for (const parte of (indice as Indice).partes) yield await leer(parte.key);
    }
    return Readable.toWeb(Readable.from(trozos())) as ReadableStream<Uint8Array>;
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
    const indice = await leerIndice(key).catch(() => null);
    if (indice) {
      await prisma.storedFile.deleteMany({
        where: { key: { in: indice.partes.map((p) => p.key) } },
      });
    }
    await prisma.storedFile.deleteMany({ where: { key } });
  },

  async componer(destino, partes, contentType) {
    // Los trozos se renombran (no se copian) para que cuelguen del fichero.
    const indice: Indice = { contentType, partes: [] };
    for (let i = 0; i < partes.length; i++) {
      const nueva = `${destino}.parte${i}`;
      await prisma.storedFile.deleteMany({ where: { key: nueva } });
      const fila = await prisma.storedFile.update({
        where: { key: partes[i] },
        data: { key: nueva },
        select: { size: true },
      });
      indice.partes.push({ key: nueva, size: fila.size });
    }
    const total = indice.partes.reduce((suma, p) => suma + p.size, 0);
    const datos = new Uint8Array(Buffer.from(JSON.stringify(indice), "utf8"));
    await prisma.storedFile.upsert({
      where: { key: destino },
      create: { key: destino, contentType: COMPUESTO, size: total, data: datos },
      update: { contentType: COMPUESTO, size: total, data: datos },
    });
  },

  /**
   * Solo el tramo pedido: la base de datos lo recorta y por la red viaja
   * ese trozo, no el PDF entero cada vez. En un fichero compuesto, solo se
   * tocan los trozos que caen dentro.
   */
  async getRange(key, inicio, fin) {
    const indice = await leerIndice(key);
    if (!indice) return tramoDeFila(key, inicio, Math.max(0, fin - inicio));
    const salida: Buffer[] = [];
    let base = 0;
    for (const parte of indice.partes) {
      const desde = Math.max(inicio, base);
      const hasta = Math.min(fin, base + parte.size);
      if (desde < hasta) salida.push(await tramoDeFila(parte.key, desde - base, hasta - desde));
      base += parte.size;
      if (base >= fin) break;
    }
    return Buffer.concat(salida);
  },

  async exists(key) {
    const fila = await prisma.storedFile.findUnique({
      where: { key },
      select: { key: true },
    });
    return fila !== null;
  },
};
