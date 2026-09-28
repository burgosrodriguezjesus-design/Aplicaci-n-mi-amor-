/**
 * El repaso de hoy: las tarjetas que tocan (las que están a punto de
 * olvidarse) y unas pocas nuevas, sin pasar de un tope diario para que el
 * repaso no se haga eterno. Se puede pedir de todos los documentos a la vez
 * o de uno solo.
 */
import "server-only";
import { prisma } from "@/lib/db";
import { cargarDocumento } from "@/lib/preguntas/documento";
import { type Tarjeta, tarjetasDe } from "./crear";
import { type EstadoTarjeta, type Nota, aprendida, siguiente } from "./repaso";

/** Tarjetas nuevas que se presentan al día, como mucho. */
export const NUEVAS_AL_DIA = 20;
/** Documentos que entran en el repaso de todo (los más recientes). */
const MAXIMO_DOCUMENTOS = 25;

export type ElementoCola = {
  documentId: string;
  documento: string;
  tarjeta: Tarjeta;
  estado: EstadoTarjeta | null;
};

export type ResumenDocumento = {
  documentId: string;
  documento: string;
  total: number;
  aprendidas: number;
  pendientes: number;
  nuevas: number;
};

function inicioDelDia(ahora: Date) {
  const d = new Date(ahora);
  d.setHours(0, 0, 0, 0);
  return d;
}

type Fila = { cardKey: string; documentId: string; interval: number; ease: number; reps: number; lapses: number; due: Date };

function estadoDe(f: Fila): EstadoTarjeta {
  return { intervalo: f.interval, facilidad: f.ease, repeticiones: f.reps, fallos: f.lapses, vence: f.due };
}

export async function colaDeHoy(userId: string, documentId?: string | null, ahora = new Date()) {
  const documentos = await prisma.document.findMany({
    where: { userId, status: "READY", ...(documentId ? { id: documentId } : {}) },
    orderBy: { createdAt: "desc" },
    take: documentId ? 1 : MAXIMO_DOCUMENTOS,
    select: { id: true, title: true },
  });
  if (documentId && !documentos.length) return null;

  const [filas, nuevasHoy] = await Promise.all([
    prisma.cardReview.findMany({
      where: { userId, documentId: { in: documentos.map((d) => d.id) } },
      select: { cardKey: true, documentId: true, interval: true, ease: true, reps: true, lapses: true, due: true },
    }),
    prisma.cardReview.count({ where: { userId, createdAt: { gte: inicioDelDia(ahora) } } }),
  ]);
  const porClave = new Map(filas.map((f) => [`${f.documentId}|${f.cardKey}`, f]));

  const vencidas: ElementoCola[] = [];
  const nuevasPorDoc: ElementoCola[][] = [];
  const resumen: ResumenDocumento[] = [];
  let proxima: Date | null = null;

  for (const doc of documentos) {
    const cargado = await cargarDocumento(userId, doc.id);
    if (!cargado) continue;
    const tarjetas = tarjetasDe(cargado.documento.contenido);
    const nuevas: ElementoCola[] = [];
    let aprendidas = 0;
    let pendientes = 0;
    for (const tarjeta of tarjetas) {
      const fila = porClave.get(`${doc.id}|${tarjeta.clave}`);
      if (!fila) {
        nuevas.push({ documentId: doc.id, documento: doc.title, tarjeta, estado: null });
        continue;
      }
      const estado = estadoDe(fila);
      if (aprendida(estado)) aprendidas++;
      if (fila.due <= ahora) {
        pendientes++;
        vencidas.push({ documentId: doc.id, documento: doc.title, tarjeta, estado });
      } else if (!proxima || fila.due < proxima) proxima = fila.due;
    }
    nuevasPorDoc.push(nuevas);
    resumen.push({ documentId: doc.id, documento: doc.title, total: tarjetas.length, aprendidas, pendientes, nuevas: nuevas.length });
  }

  // Las nuevas, repartidas entre documentos y en el orden del temario.
  const cupo = Math.max(0, NUEVAS_AL_DIA - nuevasHoy);
  const nuevas: ElementoCola[] = [];
  for (let i = 0; nuevas.length < cupo && nuevasPorDoc.some((l) => l.length > i); i++) {
    for (const lista of nuevasPorDoc) if (lista[i] && nuevas.length < cupo) nuevas.push(lista[i]);
  }

  // Primero lo que se está olvidando; las nuevas, intercaladas (una cada tres).
  vencidas.sort((a, b) => (a.estado!.vence.getTime() - b.estado!.vence.getTime()));
  const cola: ElementoCola[] = [];
  const pendientesVencidas = [...vencidas];
  const pendientesNuevas = [...nuevas];
  while (pendientesVencidas.length || pendientesNuevas.length) {
    for (let k = 0; k < 3 && pendientesVencidas.length; k++) cola.push(pendientesVencidas.shift()!);
    if (pendientesNuevas.length) cola.push(pendientesNuevas.shift()!);
  }

  return {
    cola: cola.slice(0, 200),
    resumen,
    totales: {
      pendientes: vencidas.length,
      nuevas: nuevas.length,
      aprendidas: resumen.reduce((s, r) => s + r.aprendidas, 0),
      total: resumen.reduce((s, r) => s + r.total, 0),
      nuevasHoy,
      cupoNuevas: NUEVAS_AL_DIA,
      proxima,
    },
  };
}

/** Anota cómo ha ido una tarjeta y devuelve cuándo vuelve. null si no existe o no es suya. */
export async function registrarRepaso(userId: string, documentId: string, clave: string, nota: Nota, ahora = new Date()) {
  const cargado = await cargarDocumento(userId, documentId);
  if (!cargado) return null;
  if (!tarjetasDe(cargado.documento.contenido).some((t) => t.clave === clave)) return null;

  const donde = { userId_documentId_cardKey: { userId, documentId, cardKey: clave } };
  const previa = await prisma.cardReview.findUnique({ where: donde });
  const nuevo = siguiente(previa ? estadoDe(previa) : null, nota, ahora);
  const datos = {
    interval: nuevo.intervalo,
    ease: nuevo.facilidad,
    reps: nuevo.repeticiones,
    lapses: nuevo.fallos,
    due: nuevo.vence,
    lastGrade: nota,
  };
  await prisma.cardReview.upsert({
    where: donde,
    create: { userId, documentId, cardKey: clave, ...datos, reviewCount: 1 },
    update: { ...datos, reviewCount: { increment: 1 } },
  });
  return nuevo;
}
