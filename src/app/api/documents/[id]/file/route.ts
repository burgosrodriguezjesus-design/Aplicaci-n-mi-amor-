import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, route } from "@/lib/api";
import { leerTramo, storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lo mas que se entrega de una vez al pedir un tramo. Vercel no deja que una
 * respuesta pase de 4,5 MB, asi que el visor pide el PDF a trozos.
 */
const MAX_TRAMO = 3 * 1024 * 1024;

/** Interpreta "bytes=inicio-fin" (fin incluido). null si no se entiende. */
function tramoPedido(cabecera: string | null, total: number) {
  const partes = /^bytes=(\d*)-(\d*)$/.exec(cabecera?.trim() ?? "");
  if (!partes || (partes[1] === "" && partes[2] === "")) return null;
  let inicio: number;
  let fin: number;
  if (partes[1] === "") {
    // "bytes=-N": los ultimos N bytes.
    inicio = Math.max(0, total - Number(partes[2]));
    fin = total - 1;
  } else {
    inicio = Number(partes[1]);
    fin = partes[2] === "" ? total - 1 : Math.min(Number(partes[2]), total - 1);
  }
  if (!Number.isFinite(inicio) || inicio >= total || fin < inicio) return "fuera" as const;
  return { inicio, fin: Math.min(fin, inicio + MAX_TRAMO - 1) };
}

/**
 * Sirve el PDF original. El fichero vive fuera de /public: solo se entrega
 * si la sesión pertenece al propietario del documento.
 */
export const GET = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, userId: user.id },
      select: { storageKey: true, originalName: true, sizeBytes: true },
    });
    if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

    if (!(await storage.exists(document.storageKey))) {
      return fail("El fichero original ya no está disponible.", 410, "FILE_MISSING");
    }

    const total = document.sizeBytes;
    const disposicion = `inline; filename*=UTF-8''${encodeURIComponent(document.originalName)}`;

    const tramo = tramoPedido(request.headers.get("range"), total);
    if (tramo === "fuera") {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    if (tramo) {
      const datos = await leerTramo(document.storageKey, tramo.inicio, tramo.fin + 1);
      return new Response(new Uint8Array(datos), {
        status: 206,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(datos.length),
          "Content-Range": `bytes ${tramo.inicio}-${tramo.inicio + datos.length - 1}/${total}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": disposicion,
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const stream = await storage.stream(document.storageKey);
    return new Response(stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposicion,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
