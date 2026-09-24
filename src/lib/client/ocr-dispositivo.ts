/**
 * Lectura de páginas escaneadas en el propio dispositivo.
 *
 * Es mucho más rápida que en el servidor gratuito: un móvil actual tiene
 * varios núcleos potentes y no se corta a los 60 segundos. Y es fiable: no
 * depende de lo que haya instalado en el servidor.
 *
 * - El PDF se dibuja página a página (en el hilo principal: pdf.js solo sabe
 *   hacerlo ahí) por delante de los lectores, para que ninguno espere.
 * - Varios lectores a la vez con el modelo rápido. Si una página sale con
 *   poca confianza, se relee con el modelo preciso y se queda la mejor.
 * - Las páginas se reservan en el servidor antes de leerlas: si hay otro
 *   dispositivo o un servidor leyendo el mismo documento, no se repite nada.
 * - Lo leído se manda por tandas; si se corta, se pierde como mucho la tanda.
 * - Mientras lee, la pantalla no se apaga.
 */
import { api, ApiError } from "./api";
import { descargarPdf } from "./pdf";
import { paginaDesdeItems, type TextItem } from "@/lib/pdf/lineas";
import { guardarPdfLocal, pdfLocal } from "./pdf-local";

const BASE = "/ocr";
/** Ancho al que se dibuja la página: por debajo se come tildes y comas. */
const ANCHO_OBJETIVO = 1650;
/** Por debajo de esta confianza (0-100) se relee con el modelo preciso. */
const CONFIANZA_MINIMA = 70;
const TANDA = 4;

type Lectura = { data: { text: string; confidence: number } };
type Lector = { recognize: (imagen: Blob) => Promise<Lectura>; terminate: () => Promise<unknown> };
type Motor = {
  createWorker: (idioma: string, oem: number, opciones: Record<string, unknown>) => Promise<Lector>;
};
type PdfPagina = {
  getTextContent: () => Promise<{ items: unknown[] }>;
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
  };
  cleanup: () => void;
};
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPagina>;
  destroy: () => Promise<void>;
};
type RangoPdf = {
  requestDataRange: (inicio: number, fin: number) => void;
  onDataRange: (inicio: number, datos: Uint8Array) => void;
};
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  PDFDataRangeTransport: new (largo: number, inicial: Uint8Array | null) => RangoPdf;
  getDocument: (o: Record<string, unknown>) => { promise: Promise<PdfDoc> };
};

export type ResultadoLectura = "hecho" | "sin-motor" | "sin-pdf" | "cancelado";

/* ── PDF recién subido: se lee de memoria, sin volver a descargarlo ──── */

const pdfsLocales = new Map<string, Blob>();

export function recordarPdfLocal(documentId: string, fichero: Blob) {
  pdfsLocales.clear(); // uno basta: un libro escaneado pesa mucho
  pdfsLocales.set(documentId, fichero);
}

/** ¿Tiene este dispositivo el PDF (en memoria o guardado)? */
export async function tienePdfLocal(documentId: string) {
  return pdfsLocales.has(documentId) || (await pdfLocal(documentId)) !== null;
}

/** Guarda para siempre en el dispositivo un PDF que no se sube al servidor. */
export async function conservarPdfLocal(documentId: string, fichero: Blob) {
  recordarPdfLocal(documentId, fichero);
  await guardarPdfLocal(documentId, fichero);
}

/* ── Carga perezosa del motor y del dibujante ──────────────────────── */

let motor: Promise<Motor> | null = null;

function cargarMotor(): Promise<Motor> {
  if (motor) return motor;
  motor = new Promise<Motor>((resolve, reject) => {
    const global = window as unknown as { Tesseract?: Motor };
    if (global.Tesseract) return resolve(global.Tesseract);
    const etiqueta = document.createElement("script");
    etiqueta.src = `${BASE}/tesseract.min.js`;
    etiqueta.async = true;
    etiqueta.onload = () =>
      global.Tesseract ? resolve(global.Tesseract) : reject(new Error("motor incompleto"));
    etiqueta.onerror = () => reject(new Error("no se ha podido cargar el motor de lectura"));
    document.head.appendChild(etiqueta);
  }).catch((error) => {
    motor = null;
    throw error;
  });
  return motor;
}

let pdfjs: Promise<PdfJs> | null = null;

function cargarPdfjs(): Promise<PdfJs> {
  if (pdfjs) return pdfjs;
  const ruta = `${BASE}/pdf.min.mjs`;
  pdfjs = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ ruta)
    .then((modulo: PdfJs) => {
      modulo.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
      return modulo;
    })
    .catch((error) => {
      pdfjs = null;
      throw error;
    });
  return pdfjs;
}

/**
 * El PDF abierto, compartido entre la extracción del texto y la lectura de
 * las escaneadas: un libro de 60 MB se abre una vez, no dos.
 */
let pdfAbierto: { documentId: string; doc: Promise<PdfDoc> } | null = null;

/** El PDF no está en este dispositivo y el servidor tampoco lo tiene. */
export class SinPdfLocal extends Error {}

/** El PDF: de memoria, del almacén del dispositivo o, si no, del servidor. */
async function obtenerPdf(documentId: string, soloDispositivo = false): Promise<Blob> {
  const enMemoria = pdfsLocales.get(documentId);
  if (enMemoria) return enMemoria;
  const guardado = await pdfLocal(documentId);
  if (guardado) return guardado;
  if (soloDispositivo) throw new SinPdfLocal();
  return descargarPdf(documentId);
}

/**
 * Abre el PDF leyendo solo los trozos que hacen falta en cada momento, en
 * vez de cargarlo entero en memoria. Con un libro de 400 MB, cargarlo de
 * golpe (y copiarlo al hilo de pdf.js) tumbaría el navegador del móvil.
 */
async function abrirDesdeBlob(pdf: PdfJs, fichero: Blob): Promise<PdfDoc> {
  const TROZO = 1 << 20;
  const inicial = new Uint8Array(await fichero.slice(0, Math.min(fichero.size, TROZO)).arrayBuffer());
  const rango = new pdf.PDFDataRangeTransport(fichero.size, inicial);
  rango.requestDataRange = (inicio: number, fin: number) => {
    void fichero
      .slice(inicio, fin)
      .arrayBuffer()
      .then((datos) => rango.onDataRange(inicio, new Uint8Array(datos)));
  };
  return pdf.getDocument({
    range: rango,
    length: fichero.size,
    rangeChunkSize: TROZO,
    disableAutoFetch: true,
    disableStream: true,
  }).promise;
}

function abrirPdf(documentId: string, soloDispositivo = false): Promise<PdfDoc> {
  if (pdfAbierto?.documentId === documentId) return pdfAbierto.doc;
  void cerrarPdf();
  const doc = (async () => {
    const pdf = await cargarPdfjs();
    return abrirDesdeBlob(pdf, await obtenerPdf(documentId, soloDispositivo));
  })();
  pdfAbierto = { documentId, doc };
  doc.catch(() => {
    if (pdfAbierto?.doc === doc) pdfAbierto = null;
  });
  return doc;
}

async function cerrarPdf() {
  const abierto = pdfAbierto;
  pdfAbierto = null;
  if (abierto) await (await abierto.doc.catch(() => null))?.destroy().catch(() => undefined);
}

async function crearLector(modelo: "rapido" | "preciso"): Promise<Lector> {
  const Tesseract = await cargarMotor();
  return Tesseract.createWorker("spa", 1, {
    workerPath: `${BASE}/worker.min.js`,
    corePath: `${BASE}/core`,
    langPath: `${window.location.origin}${BASE}/${modelo}`,
    gzip: true,
    workerBlobURL: false,
    // El modelo se guarda en el dispositivo: la segunda vez no se descarga.
    cacheMethod: "write",
    cachePath: `estudia-${modelo}`,
  });
}

/** Cuántos lectores a la vez sin ahogar el dispositivo. */
function carriles() {
  const nucleos = navigator.hardwareConcurrency || 4;
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  // Safari (iPhone) no dice la memoria; los iPhone actuales van sobrados.
  if (memoria === undefined) return Math.max(2, Math.min(3, nucleos - 1));
  if (memoria <= 2) return 1;
  if (memoria <= 4) return Math.min(2, nucleos);
  // Se deja un núcleo para dibujar: si el dibujante se queda sin turno, los
  // lectores esperan de brazos cruzados.
  return Math.max(2, Math.min(4, nucleos - 1));
}

async function dibujar(doc: PdfDoc, numero: number): Promise<Blob | null> {
  const pagina = await doc.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  const escala = Math.max(1, Math.min(3.2, ANCHO_OBJETIVO / base.width));
  const vista = pagina.getViewport({ scale: escala });
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.ceil(vista.width);
  lienzo.height = Math.ceil(vista.height);
  const ctx = lienzo.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
  pagina.cleanup();
  const imagen = await new Promise<Blob | null>((listo) =>
    lienzo.toBlob(listo, "image/jpeg", 0.9),
  );
  lienzo.width = 0;
  lienzo.height = 0;
  return imagen;
}

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

type Reserva = { token: string; paginas: number[]; pendientes: number };

/* ── Lectura de un documento ───────────────────────────────────────── */

let enCurso: { documentId: string; promesa: Promise<ResultadoLectura> } | null = null;

/** Una sola lectura a la vez. Si ya se está leyendo ese documento, se une. */
export function leerEnDispositivo(
  documentId: string,
  opciones: { cancelado?: () => boolean; soloDispositivo?: boolean } = {},
): Promise<ResultadoLectura> {
  if (enCurso?.documentId === documentId) return enCurso.promesa;
  if (enCurso) return enCurso.promesa.then(() => leerEnDispositivo(documentId, opciones));
  const promesa = leer(documentId, opciones.cancelado, opciones.soloDispositivo).finally(() => {
    enCurso = null;
  });
  enCurso = { documentId, promesa };
  return promesa;
}

async function leer(
  documentId: string,
  cancelado?: () => boolean,
  soloDispositivo = false,
): Promise<ResultadoLectura> {
  const n = carriles();
  let lectores: Lector[] = [];
  let preciso: Promise<Lector | null> | null = null;
  let doc: PdfDoc | null = null;
  let bloqueo: { release: () => Promise<void> } | null = null;
  const tokensAbiertos = new Set<string>();

  try {
    // Pantalla encendida mientras lee (si el navegador lo permite).
    try {
      const wl = (navigator as Navigator & {
        wakeLock?: { request: (tipo: "screen") => Promise<{ release: () => Promise<void> }> };
      }).wakeLock;
      bloqueo = (await wl?.request("screen")) ?? null;
    } catch {
      bloqueo = null;
    }

    try {
      const [abierto, ...creados] = await Promise.all([
        abrirPdf(documentId, soloDispositivo),
        ...Array.from({ length: n }, () => crearLector("rapido")),
      ]);
      lectores = creados as Lector[];
      doc = abierto as PdfDoc;
    } catch (error) {
      return error instanceof SinPdfLocal ? "sin-pdf" : "sin-motor";
    }

    const releer = async (imagen: Blob): Promise<Lectura | null> => {
      preciso ??= crearLector("preciso").catch(() => null);
      const lector = await preciso;
      return lector ? lector.recognize(imagen).catch(() => null) : null;
    };

    // Cola de páginas dibujadas esperando lector, y lecturas por mandar.
    const listas: { pagina: number; token: string; imagen: Blob | null }[] = [];
    const porMandar = new Map<string, { pageNumber: number; text: string }[]>();
    let terminado = false;
    /** Páginas reservadas por este dispositivo y aún sin mandar. */
    let enVuelo = 0;
    const despertadores: (() => void)[] = [];
    const despertar = () => {
      while (despertadores.length) despertadores.shift()?.();
    };

    const mandar = async (token: string, forzar = false) => {
      const lote = porMandar.get(token) ?? [];
      if (lote.length === 0 || (!forzar && lote.length < TANDA)) return;
      porMandar.set(token, []);
      try {
        await api.post(`/api/documents/${documentId}/ocr`, {
          accion: "guardar",
          token,
          lecturas: lote,
        });
        enVuelo -= lote.length;
      } catch {
        // Se reintenta con la siguiente tanda.
        porMandar.set(token, [...lote, ...(porMandar.get(token) ?? [])]);
      }
    };

    const dibujante = async () => {
      let esperas = 0;
      while (!cancelado?.()) {
        if (listas.length >= n + 1) {
          await esperar(30);
          continue;
        }
        let reserva: Reserva;
        try {
          reserva = await api.post<Reserva>(`/api/documents/${documentId}/ocr`, {
            accion: "reclamar",
            cuantas: n * 2,
          });
        } catch (error) {
          // El documento ya no existe o ya no se procesa: no hay nada que leer.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) break;
          await esperar(3000);
          continue;
        }
        if (reserva.paginas.length === 0) {
          if (reserva.pendientes === 0) break;
          if (enVuelo > 0) {
            // Las que quedan son las que este mismo dispositivo está leyendo
            // o tiene sin mandar: se manda lo que haya y se vuelve a mirar.
            for (const token of porMandar.keys()) await mandar(token, true);
            await esperar(400);
            continue;
          }
          // Quedan, pero las tiene reservadas otro: se espera a que acabe
          // o a que su reserva caduque.
          if (++esperas > 60) break;
          await esperar(5000);
          continue;
        }
        esperas = 0;
        enVuelo += reserva.paginas.length;
        tokensAbiertos.add(reserva.token);
        for (const pagina of reserva.paginas) {
          if (cancelado?.()) break;
          let imagen: Blob | null = null;
          try {
            imagen = await dibujar(doc as PdfDoc, pagina);
          } catch {
            imagen = null;
          }
          listas.push({ pagina, token: reserva.token, imagen });
          despertar();
        }
      }
      terminado = true;
      despertar();
    };

    const siguiente = async () => {
      for (;;) {
        if (cancelado?.()) return null;
        const trabajo = listas.shift();
        if (trabajo) return trabajo;
        if (terminado) return null;
        await new Promise<void>((listo) => despertadores.push(listo));
      }
    };

    const carril = async (lector: Lector) => {
      for (;;) {
        const trabajo = await siguiente();
        if (!trabajo) return;
        let texto = "";
        if (trabajo.imagen) {
          try {
            let mejor = await lector.recognize(trabajo.imagen);
            if (mejor.data.confidence < CONFIANZA_MINIMA) {
              const otra = await releer(trabajo.imagen);
              if (otra && otra.data.confidence > mejor.data.confidence) mejor = otra;
            }
            texto = mejor.data.text ?? "";
          } catch {
            texto = "";
          }
        }
        const lote = porMandar.get(trabajo.token) ?? [];
        lote.push({ pageNumber: trabajo.pagina, text: texto });
        porMandar.set(trabajo.token, lote);
        await mandar(trabajo.token);
      }
    };

    await Promise.all([dibujante(), ...lectores.map(carril)]);
    for (const token of porMandar.keys()) await mandar(token, true);
    return cancelado?.() ? "cancelado" : "hecho";
  } finally {
    // Lo reservado y no leído queda libre para otro.
    for (const token of tokensAbiertos) {
      void api
        .post(`/api/documents/${documentId}/ocr`, { accion: "soltar", token })
        .catch(() => undefined);
    }
    await Promise.all(lectores.map((l) => l.terminate().catch(() => undefined)));
    const p = preciso ? await (preciso as Promise<Lector | null>).catch(() => null) : null;
    await p?.terminate().catch(() => undefined);
    // Terminado este documento, se suelta la memoria del PDF.
    if (!cancelado?.()) await cerrarPdf();
    await bloqueo?.release().catch(() => undefined);
  }
}

/* ── Extracción del texto en el dispositivo ────────────────────────── */

/** Tamaño máximo (aprox.) de cada envío: muy por debajo de los 4,5 MB de Vercel. */
const BYTES_POR_ENVIO = 1_500_000;

type ResultadoExtraccion = "hecho" | "error" | "sin-pdf";
let extrayendo: { documentId: string; promesa: Promise<ResultadoExtraccion> } | null = null;

/**
 * Saca el texto de todas las páginas aquí mismo y lo manda al servidor.
 * Con el PDF recién subido tarda segundos incluso con cientos de páginas, y
 * el servidor no tiene que abrirlo. Usa exactamente el mismo código que el
 * servidor (src/lib/pdf/lineas.ts): el resultado es idéntico.
 */
export function extraerEnDispositivo(
  documentId: string,
  soloDispositivo = false,
): Promise<ResultadoExtraccion> {
  if (extrayendo?.documentId === documentId) return extrayendo.promesa;
  const promesa = extraer(documentId, soloDispositivo).finally(() => {
    extrayendo = null;
  });
  extrayendo = { documentId, promesa };
  return promesa;
}

async function extraer(documentId: string, soloDispositivo: boolean): Promise<ResultadoExtraccion> {
  let doc: PdfDoc;
  try {
    doc = await abrirPdf(documentId, soloDispositivo);
  } catch (error) {
    if (error instanceof SinPdfLocal) return "sin-pdf";
    // Protegido, dañado o sin motor: lo hará el servidor, que da el error claro.
    return "error";
  }

  const total = doc.numPages;
  type Envio = { pageNumber: number; text: string; source: "TEXT" | "EMPTY"; lines: unknown[] };
  let lote: Envio[] = [];
  let bytes = 0;

  const enviar = async (fin: boolean) => {
    for (let intento = 1; ; intento++) {
      try {
        await api.post(`/api/documents/${documentId}/paginas`, { pageCount: total, lote, fin });
        lote = [];
        bytes = 0;
        return;
      } catch (error) {
        // Límite de páginas, documento ya terminado...: no tiene arreglo aquí.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
        if (intento >= 3) throw error;
        await esperar(1500 * intento);
      }
    }
  };

  try {
    for (let numero = 1; numero <= total; numero++) {
      let pagina: ReturnType<typeof paginaDesdeItems>;
      try {
        const p = await doc.getPage(numero);
        const contenido = await p.getTextContent();
        pagina = paginaDesdeItems(contenido.items as TextItem[]);
        p.cleanup();
      } catch {
        pagina = paginaDesdeItems([]);
      }
      const envio = { pageNumber: numero, text: pagina.text, source: pagina.source, lines: pagina.lines };
      lote.push(envio);
      bytes += pagina.text.length * 2 + pagina.lines.length * 60;
      if (bytes >= BYTES_POR_ENVIO || lote.length >= 60) await enviar(false);
    }
    await enviar(true);
    return "hecho";
  } catch {
    return "error";
  }
}

/**
 * Todo el trabajo del dispositivo con un PDF recién elegido: primero el texto
 * de todas las páginas (segundos) y en seguida las escaneadas. Empieza
 * mientras el PDF aún se está subiendo.
 */
export async function procesarEnDispositivo(
  documentId: string,
  cancelado?: () => boolean,
  soloDispositivo = false,
) {
  if ((await extraerEnDispositivo(documentId, soloDispositivo)) !== "hecho" || cancelado?.()) return;
  await leerEnDispositivo(documentId, { cancelado, soloDispositivo });
}
