/**
 * Una ronda de trabajo en segundo plano (ver src/lib/jobs/impulso.ts).
 *
 * Solo la llama la propia aplicación, con su clave interna. Responde al
 * momento y trabaja después; al acabar, pide la siguiente ronda si queda
 * algo. Así el documento se termina aunque nadie tenga la app abierta.
 */
import { after } from "next/server";
import { ensureWorker } from "@/lib/jobs";
import { runQueue, sliceDeadline } from "@/lib/jobs/queue";
import {
  asegurarLectores,
  colaTerminada,
  documentoParaServidor,
  esInterna,
  marcarColaViva,
  origenDe,
  siguiente,
} from "@/lib/jobs/impulso";
import { avisarProgresoOcr, reconocerRepartido } from "@/lib/jobs/ocr-repartido";
import { pdfEnDisco } from "@/lib/storage/en-disco";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

async function rondaDeCola(origen: string) {
  await marcarColaViva();
  await ensureWorker({ run: false });
  const inicio = Date.now();
  const deadline = sliceDeadline();
  const { pending } = await runQueue({ deadline });
  // Si hay escaneadas que nadie lee (la app está cerrada), a leerlas.
  await asegurarLectores(origen).catch(() => undefined);
  if (!pending) {
    await colaTerminada();
    return;
  }
  // Si la ronda ha vuelto enseguida es que espera a otro (las escaneadas):
  // no hace falta preguntar cada 3 segundos.
  if (Date.now() - inicio < 10_000) await esperar(12_000);
  await marcarColaViva();
  await siguiente(origen, "cola");
}

async function rondaDeLectura(origen: string) {
  const doc = await documentoParaServidor();
  if (!doc) return;
  const deadline = Date.now() + 45_000;
  const pdfPath = await pdfEnDisco(doc.storageKey, doc.sizeBytes);
  await reconocerRepartido({ documentId: doc.id, pdfPath, deadline });
  await avisarProgresoOcr(doc.id, true).catch(() => undefined);
  if (await documentoParaServidor()) await siguiente(origen, "ocr");
}

export async function POST(request: Request) {
  if (!(await esInterna(request))) {
    return Response.json({ error: { code: "FORBIDDEN", message: "No." } }, { status: 403 });
  }
  const origen = origenDe(request);
  const tipo = new URL(request.url).searchParams.get("tipo");
  after(async () => {
    try {
      if (tipo === "ocr") await rondaDeLectura(origen);
      else await rondaDeCola(origen);
    } catch (error) {
      console.error("[impulso]", error);
      // Un fallo no para la cadena de la cola: la siguiente ronda reintenta
      // (con calma, para no insistir sin parar si algo está caído).
      if (tipo !== "ocr") {
        await esperar(20_000);
        await siguiente(origen, "cola");
      }
    }
  });
  return Response.json({ aceptado: true }, { status: 202 });
}
