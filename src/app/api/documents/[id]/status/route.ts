import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Endpoint ligero para el sondeo del progreso de procesamiento. */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        status: true,
        statusMessage: true,
        progress: true,
        pageCount: true,
        errorCode: true,
        errorMessage: true,
        textCoverage: true,
        usedOcr: true,
      },
    });

    if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");
    return ok({ document });
  },
);
