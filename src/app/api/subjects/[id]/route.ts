import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  emoji: z.string().trim().max(8).optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const body = schema.parse(await request.json());

  const subject = await prisma.subject.findFirst({ where: { id, userId: user.id } });
  if (!subject) return fail("Esa asignatura no existe.", 404, "NOT_FOUND");

  return ok({ subject: await prisma.subject.update({ where: { id }, data: body }) });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const subject = await prisma.subject.findFirst({ where: { id, userId: user.id } });
  if (!subject) return fail("Esa asignatura no existe.", 404, "NOT_FOUND");

  // Los documentos no se borran: quedan sin asignatura.
  await prisma.subject.delete({ where: { id } });
  return ok({ ok: true });
});
