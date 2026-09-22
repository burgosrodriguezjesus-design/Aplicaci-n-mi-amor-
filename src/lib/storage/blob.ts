/**
 * Almacenamiento en Vercel Blob.
 *
 * Es la opcion que no pide nada: se crea desde el propio panel de Vercel, en
 * dos clics, y la variable con el permiso la pone Vercel sola. Sin cuentas en
 * otros sitios, sin claves que copiar y sin tarjeta.
 *
 * Los ficheros se guardan como **privados**: no existe una URL publica desde
 * la que descargar tus apuntes. La aplicacion los sirve solo a traves de sus
 * rutas autenticadas, igual que con el disco local.
 */
import "server-only";
import { del, get, head, put } from "@vercel/blob";
import type { StorageDriver } from "./index";

/** Todas las operaciones van sobre el mismo almacen privado. */
const PRIVADO = { access: "private" } as const;

function esNoEncontrado(error: unknown) {
  const nombre = (error as { name?: string })?.name ?? "";
  const mensaje = (error as { message?: string })?.message ?? "";
  return nombre === "BlobNotFoundError" || /not found|no such blob/i.test(mensaje);
}

async function leer(key: string) {
  const resultado = await get(key, PRIVADO);
  if (!resultado || !("stream" in resultado) || !resultado.stream) {
    throw new Error(`No hemos encontrado «${key}» en el almacenamiento.`);
  }
  return resultado.stream as ReadableStream<Uint8Array>;
}

export const blobDriver: StorageDriver = {
  async put(key, data, contentType) {
    await put(key, data, {
      ...PRIVADO,
      contentType,
      // La clave ya es unica (lleva un uuid): no queremos que Blob le anada
      // otro sufijo, porque entonces no sabriamos con que nombre recuperarlo.
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  },

  async get(key) {
    // Se lee con un lector explicito: no todos los entornos permiten recorrer
    // un ReadableStream con `for await`.
    const lector = (await leer(key)).getReader();
    const partes: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (value) partes.push(value);
    }
    return Buffer.concat(partes);
  },

  async stream(key) {
    return leer(key);
  },

  async size(key) {
    // `head` y `del` trabajan sobre la ruta, sin distinguir publico de privado.
    const info = await head(key);
    return info.size;
  },

  async delete(key) {
    try {
      await del(key);
    } catch (error) {
      // Borrar algo que ya no esta no es un error.
      if (!esNoEncontrado(error)) throw error;
    }
  },

  async exists(key) {
    try {
      await head(key);
      return true;
    } catch (error) {
      if (esNoEncontrado(error)) return false;
      throw error;
    }
  },
};

/** Avisa pronto si falta el permiso, en vez de al subir el primer PDF. */
export function blobConfigurado(): string | null {
  return process.env.BLOB_READ_WRITE_TOKEN
    ? null
    : "Falta BLOB_READ_WRITE_TOKEN. En Vercel se crea en Storage → Blob y se añade sola.";
}
