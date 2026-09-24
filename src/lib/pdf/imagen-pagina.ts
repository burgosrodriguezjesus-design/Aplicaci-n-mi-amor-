/**
 * La imagen escaneada de una página, sacada directamente del PDF.
 *
 * Una página escaneada es, por dentro, una foto. En vez de "dibujar" la página
 * con una librería gráfica nativa en un proceso aparte (lo que fallaba en
 * Vercel), se le pide a pdf.js la imagen ya decodificada —en JavaScript puro:
 * vale igual para JPEG, JBIG2 (el típico de escáner en blanco y negro), CCITT
 * o PNG— y se entrega al lector en gris y a la resolución que necesita.
 *
 * Sin binarios nativos ni procesos hijos: funciona en cualquier alojamiento.
 */
import "server-only";
import { loadPdfjs } from "./pdfjs";

/** Ancho al que se lleva la imagen: el lector no gana nada por encima. */
const ANCHO_OBJETIVO = 1650;

type ImagenPdf = {
  width: number;
  height: number;
  /** 1 = gris 1 bit, 2 = RGB, 3 = RGBA (ImageKind de pdf.js). */
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
};

type PaginaPdf = {
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: { get: (id: string, cb: (valor: unknown) => void) => void };
  commonObjs: { get: (id: string, cb: (valor: unknown) => void) => void };
  cleanup: () => void;
};

export type DocumentoPdf = {
  numPages: number;
  getPage: (n: number) => Promise<unknown>;
  destroy: () => Promise<void>;
};

/** Abre un PDF para sacar imágenes (sin canvas: todo en JavaScript). */
export async function abrirParaImagenes(data: Uint8Array): Promise<DocumentoPdf> {
  const pdfjs = await loadPdfjs();
  const tarea = pdfjs.getDocument({
    data,
    isOffscreenCanvasSupported: false,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  return (await tarea.promise) as unknown as DocumentoPdf;
}

function objeto(pagina: PaginaPdf, id: string): Promise<ImagenPdf | null> {
  const almacen = id.startsWith("g_") ? pagina.commonObjs : pagina.objs;
  return new Promise((resolve) => {
    const tiempo = setTimeout(() => resolve(null), 20_000);
    try {
      almacen.get(id, (valor) => {
        clearTimeout(tiempo);
        resolve((valor as ImagenPdf) ?? null);
      });
    } catch {
      clearTimeout(tiempo);
      resolve(null);
    }
  });
}

/** Pasa la imagen a gris (1 byte por píxel), reduciéndola si hace falta. */
function aGris(img: ImagenPdf): { gris: Uint8Array; ancho: number; alto: number } | null {
  const { width, height, data, kind } = img;
  if (!data || !width || !height) return null;

  const factor = width > ANCHO_OBJETIVO * 1.1 ? ANCHO_OBJETIVO / width : 1;
  const ancho = Math.max(1, Math.round(width * factor));
  const alto = Math.max(1, Math.round(height * factor));
  const gris = new Uint8Array(ancho * alto);
  const bpp = kind === 3 ? 4 : kind === 2 ? 3 : 0;
  const filaBits = Math.ceil(width / 8);

  const valor = (x: number, y: number) => {
    if (bpp === 0) {
      // 1 bit por píxel: 1 = blanco en pdf.js (ImageKind.GRAYSCALE_1BPP).
      const byte = data[y * filaBits + (x >> 3)];
      return (byte >> (7 - (x & 7))) & 1 ? 255 : 0;
    }
    const i = (y * width + x) * bpp;
    return (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  };

  // Media de la caja de píxeles que cae en cada píxel nuevo: reduce sin
  // perder los trazos finos (tildes, comas), mejor que coger uno suelto.
  const paso = 1 / factor;
  for (let y = 0; y < alto; y++) {
    const y0 = Math.floor(y * paso);
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) * paso)));
    for (let x = 0; x < ancho; x++) {
      const x0 = Math.floor(x * paso);
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) * paso)));
      let suma = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          suma += valor(xx, yy);
          n++;
        }
      }
      gris[y * ancho + x] = n ? suma / n : 255;
    }
  }
  return { gris, ancho, alto };
}

/** BMP de 8 bits en gris: el formato más simple que el lector entiende. */
function bmpGris(gris: Uint8Array, ancho: number, alto: number): Buffer {
  const fila = (ancho + 3) & ~3;
  const cabecera = 14 + 40 + 256 * 4;
  const buf = Buffer.alloc(cabecera + fila * alto, 0);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(cabecera, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(ancho, 18);
  buf.writeInt32LE(alto, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(8, 28);
  buf.writeUInt32LE(fila * alto, 34);
  buf.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) {
    const o = 54 + i * 4;
    buf[o] = i;
    buf[o + 1] = i;
    buf[o + 2] = i;
  }
  // Las filas van de abajo arriba.
  for (let y = 0; y < alto; y++) {
    const origen = y * ancho;
    buf.set(gris.subarray(origen, origen + ancho), cabecera + (alto - 1 - y) * fila);
  }
  return buf;
}

/**
 * La imagen principal de la página (la más grande), lista para el lector.
 * null si la página no tiene ninguna imagen de tamaño útil.
 */
export async function imagenDePagina(doc: DocumentoPdf, numero: number): Promise<Buffer | null> {
  const pdfjs = await loadPdfjs();
  const pagina = (await doc.getPage(numero)) as PaginaPdf;
  try {
    const ops = await pagina.getOperatorList();
    const PINTAR = pdfjs.OPS.paintImageXObject;
    let mejor: ImagenPdf | null = null;
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== PINTAR) continue;
      const img = await objeto(pagina, String(ops.argsArray[i][0]));
      if (!img?.data) continue;
      if (!mejor || img.width * img.height > mejor.width * mejor.height) mejor = img;
    }
    // Menos de ~300 px de ancho no es una página escaneada (será un logo).
    if (!mejor || mejor.width < 300 || mejor.height < 300) return null;
    const gris = aGris(mejor);
    return gris ? bmpGris(gris.gris, gris.ancho, gris.alto) : null;
  } finally {
    pagina.cleanup();
  }
}
