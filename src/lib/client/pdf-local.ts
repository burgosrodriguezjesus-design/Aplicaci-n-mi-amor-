/**
 * PDF guardados en el propio dispositivo.
 *
 * Los PDF muy grandes (cientos de MB) no se suben: llenarían la base de datos
 * gratuita del servidor con uno solo, y subirlos por el móvil tarda mucho. Se
 * quedan aquí, en el almacenamiento del navegador (IndexedDB), y al servidor
 * solo va el texto. El visor y la relectura los sacan de aquí.
 *
 * Se pide almacenamiento "persistente" para que el sistema no los borre
 * por su cuenta cuando falta espacio o la app lleva tiempo sin abrirse.
 */

const BASE = "alicia-pdfs";
const ALMACEN = "pdfs";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BASE, 1);
    peticion.onupgradeneeded = () => {
      if (!peticion.result.objectStoreNames.contains(ALMACEN)) {
        peticion.result.createObjectStore(ALMACEN);
      }
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

async function operar<T>(
  modo: IDBTransactionMode,
  accion: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(ALMACEN, modo);
      const peticion = accion(tx.objectStore(ALMACEN));
      tx.oncomplete = () => resolve(peticion.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Guarda el PDF de un documento en el dispositivo. */
export async function guardarPdfLocal(documentId: string, fichero: Blob) {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* sin permiso: se guarda igual */
  }
  await operar("readwrite", (almacen) => almacen.put(fichero, documentId));
}

/** El PDF guardado en este dispositivo, o null si no está aquí. */
export async function pdfLocal(documentId: string): Promise<Blob | null> {
  try {
    const guardado = await operar("readonly", (almacen) => almacen.get(documentId));
    return guardado instanceof Blob ? guardado : null;
  } catch {
    return null;
  }
}

export async function borrarPdfLocal(documentId: string) {
  try {
    await operar("readwrite", (almacen) => almacen.delete(documentId));
  } catch {
    /* no estaba: nada que borrar */
  }
}
