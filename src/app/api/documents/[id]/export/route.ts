import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Descarga el resumen completo en Markdown, para estudiar fuera de la app. */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, userId: user.id },
      select: {
        title: true,
        summaries: {
          where: { isCurrent: true },
          take: 1,
          select: { markdown: true },
        },
      },
    });
    if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

    const markdown = document.summaries[0]?.markdown;
    if (!markdown) return fail("Este documento aún no tiene resumen.", 409, "NO_SUMMARY");

    const filename = `${document.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "resumen"}.md`;

    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  },
);
