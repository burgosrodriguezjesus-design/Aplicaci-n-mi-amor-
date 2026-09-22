/**
 * Capa de almacenamiento de ficheros.
 *
 * Los PDFs y los audios NUNCA se guardan en /public: viven fuera del arbol
 * servido estaticamente y solo se entregan a traves de rutas autenticadas.
 * El interfaz permite sustituir el driver local por S3/R2 sin tocar el resto
 * de la aplicacion.
 */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "../env";

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<ReadableStream<Uint8Array>>;
  size(key: string): Promise<number>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const root = path.resolve(process.cwd(), env.storage.dir);

/** Evita path traversal: una clave solo puede contener segmentos seguros. */
function resolveKey(key: string): string {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) {
    throw new Error(`Clave de almacenamiento invalida: ${key}`);
  }
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) {
    throw new Error("Clave fuera del directorio de almacenamiento.");
  }
  return full;
}

const localDriver: StorageDriver = {
  async put(key, data) {
    const full = resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  },
  async get(key) {
    return readFile(resolveKey(key));
  },
  async stream(key) {
    const nodeStream = createReadStream(resolveKey(key));
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  },
  async size(key) {
    const info = await stat(resolveKey(key));
    return info.size;
  },
  async delete(key) {
    try {
      await unlink(resolveKey(key));
    } catch {
      /* borrar algo inexistente no es un error */
    }
  },
  async exists(key) {
    try {
      await stat(resolveKey(key));
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * El driver se elige con STORAGE_DRIVER. El de S3 se carga solo si se pide,
 * para que quien use la aplicacion en su ordenador no cargue con nada.
 */
function elegirDriver(): StorageDriver {
  // Import perezoso en los dos casos: `require` aqui es deliberado, el resto
  // del fichero es sincrono y el driver debe estar listo antes del primer uso.
  if (env.storage.driver === "blob") {
    const { blobDriver, blobConfigurado } = require("./blob") as typeof import("./blob");
    const problema = blobConfigurado();
    if (problema) {
      throw new Error(
        `El almacenamiento esta puesto en "blob" pero no esta completo. ${problema}`,
      );
    }
    return blobDriver;
  }

  if (env.storage.driver === "db") {
    const { dbDriver } = require("./db") as typeof import("./db");
    return dbDriver;
  }

  if (env.storage.driver === "s3") {
    const { s3Driver, s3Configurado } = require("./s3") as typeof import("./s3");
    const problema = s3Configurado();
    if (problema) {
      throw new Error(
        `El almacenamiento esta puesto en "s3" pero no esta completo. ${problema}`,
      );
    }
    return s3Driver;
  }

  return localDriver;
}

export const storage: StorageDriver = elegirDriver();

export function buildDocumentKey(userId: string, originalName: string) {
  const safeExt = path.extname(originalName).toLowerCase() === ".pdf" ? ".pdf" : ".pdf";
  return `documents/${userId}/${randomUUID()}${safeExt}`;
}

export function buildAudioKey(documentId: string, trackId: string, ext: string) {
  return `audio/${documentId}/${trackId}.${ext.replace(/[^a-z0-9]/gi, "")}`;
}

export function checksum(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}
