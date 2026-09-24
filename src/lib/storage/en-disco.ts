/**
 * El PDF en el disco temporal del servidor.
 *
 * Un libro escaneado se procesa en muchas rondas cortas (Vercel corta cada
 * peticion). Traer el PDF entero del almacenamiento en cada ronda -60 MB desde
 * la base de datos, una y otra vez- era lo mas lento de todo y gastaba
 * transferencia sin necesidad. Los servidores que siguen vivos entre rondas
 * lo tienen ya en su carpeta temporal y lo reutilizan.
 */
import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { storage } from "./index";

const CARPETA = path.join(os.tmpdir(), "estudia-pdf");
/** Cuantos PDF se guardan a la vez: la carpeta temporal es pequeña. */
const MAXIMO = 3;

async function tamano(fichero: string) {
  try {
    return (await stat(fichero)).size;
  } catch {
    return -1;
  }
}

/** Ruta local del PDF, descargandolo solo si no esta ya. */
export async function pdfEnDisco(storageKey: string, bytes: number): Promise<string> {
  const nombre = createHash("sha256").update(storageKey).digest("hex").slice(0, 32) + ".pdf";
  const fichero = path.join(CARPETA, nombre);

  if ((await tamano(fichero)) === bytes) {
    const ahora = new Date();
    await utimes(fichero, ahora, ahora).catch(() => undefined);
    return fichero;
  }

  await mkdir(CARPETA, { recursive: true });
  const datos = await storage.get(storageKey);
  // Se escribe aparte y se renombra: otra peticion nunca ve un PDF a medias.
  const provisional = `${fichero}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(provisional, datos);
  await rename(provisional, fichero);
  await podar(nombre);
  return fichero;
}

/** Deja solo los mas recientes. */
async function podar(conservar: string) {
  try {
    const nombres = (await readdir(CARPETA)).filter((n) => n.endsWith(".pdf"));
    if (nombres.length <= MAXIMO) return;
    const conFecha = await Promise.all(
      nombres.map(async (n) => ({ n, t: (await stat(path.join(CARPETA, n))).mtimeMs })),
    );
    conFecha.sort((a, b) => b.t - a.t);
    for (const { n } of conFecha.slice(MAXIMO)) {
      if (n !== conservar) await rm(path.join(CARPETA, n), { force: true });
    }
  } catch {
    /* limpiar es un extra: si falla, no pasa nada */
  }
}
