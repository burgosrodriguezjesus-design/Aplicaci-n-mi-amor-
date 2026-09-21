import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, route } from "@/lib/api";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sirve el PDF original. El fichero vive fuera de /public: solo se entrega
 * si la sesión pertenece al propietario del documento.
 */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
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

    const stream = await storage.stream(document.storageKey);
    return new Response(stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(document.sizeBytes),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          document.originalName,
        )}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
