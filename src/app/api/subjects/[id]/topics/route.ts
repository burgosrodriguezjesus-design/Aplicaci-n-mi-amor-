import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre para el tema.").max(120),
});

export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const body = schema.parse(await request.json());

    const subject = await prisma.subject.findFirst({ where: { id, userId: user.id } });
    if (!subject) return fail("Esa asignatura no existe.", 404, "NOT_FOUND");

    const count = await prisma.topic.count({ where: { subjectId: id } });
    const topic = await prisma.topic.create({
      data: { subjectId: id, name: body.name, position: count },
    });
    return ok({ topic }, { status: 201 });
  },
);
