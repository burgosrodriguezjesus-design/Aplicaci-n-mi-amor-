import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const schema = z.object({ name: z.string().trim().min(1).max(120) });

export const PATCH = route(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const body = schema.parse(await request.json());

  const topic = await prisma.topic.findFirst({
    where: { id, subject: { userId: user.id } },
  });
  if (!topic) return fail("Ese tema no existe.", 404, "NOT_FOUND");

  return ok({ topic: await prisma.topic.update({ where: { id }, data: body }) });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const topic = await prisma.topic.findFirst({
    where: { id, subject: { userId: user.id } },
  });
  if (!topic) return fail("Ese tema no existe.", 404, "NOT_FOUND");

  await prisma.topic.delete({ where: { id } });
  return ok({ ok: true });
});
