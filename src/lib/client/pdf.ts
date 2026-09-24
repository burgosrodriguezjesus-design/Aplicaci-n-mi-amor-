/**
 * Descarga del PDF original a trozos.
 *
 * Vercel no deja que una respuesta pase de 4,5 MB, y un PDF escaneado pesa
 * mucho mas. Se pide por tramos (cabecera Range) y se junta en el navegador;
 * el visor lo abre desde memoria. Si el servidor lo manda entero, tambien vale.
 */

const TRAMO = 3 * 1024 * 1024;

export class PdfDownloadError extends Error {}

export async function descargarPdf(
  documentId: string,
  alAvanzar?: (porcentaje: number) => void,
  senal?: AbortSignal,
): Promise<Blob> {
  const url = `/api/documents/${documentId}/file`;
  const trozos: ArrayBuffer[] = [];
  let recibidos = 0;
  let total = Infinity;

  while (recibidos < total) {
    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        headers: { Range: `bytes=${recibidos}-${recibidos + TRAMO - 1}` },
        cache: "no-store",
        signal: senal,
      });
    } catch (error) {
      if (senal?.aborted) throw error;
      throw new PdfDownloadError("Se ha perdido la conexión al descargar el PDF.");
    }

    if (respuesta.status === 200) {
      // El servidor no trocea: el cuerpo es el PDF entero.
      const entero = await respuesta.arrayBuffer();
      alAvanzar?.(100);
      return new Blob([entero], { type: "application/pdf" });
    }
    if (respuesta.status !== 206) {
      let mensaje = "No hemos podido cargar el PDF.";
      try {
        mensaje = (await respuesta.json())?.error?.message ?? mensaje;
      } catch {
        /* respuesta sin JSON */
      }
      throw new PdfDownloadError(mensaje);
    }

    const rango = /\/(\d+)\s*$/.exec(respuesta.headers.get("content-range") ?? "");
    if (rango) total = Number(rango[1]);
    const trozo = await respuesta.arrayBuffer();
    if (trozo.byteLength === 0) break;
    trozos.push(trozo);
    recibidos += trozo.byteLength;
    if (Number.isFinite(total)) alAvanzar?.(Math.round((recibidos / total) * 100));
  }

  return new Blob(trozos, { type: "application/pdf" });
}
