import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const subjects = await prisma.subject.findMany({
    where: { userId: user.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      topics: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
          documents: {
            select: { id: true, title: true, status: true, pageCount: true },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      _count: { select: { documents: true } },
    },
  });
  return ok({ subjects });
});

const schema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre para la asignatura.").max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  emoji: z.string().trim().max(8).default("📘"),
});

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = schema.parse(await request.json());

  const existing = await prisma.subject.findFirst({
    where: { userId: user.id, name: body.name },
  });
  if (existing) return fail("Ya tienes una asignatura con ese nombre.", 409, "DUPLICATE");

  const count = await prisma.subject.count({ where: { userId: user.id } });
  const subject = await prisma.subject.create({
    data: { ...body, userId: user.id, position: count },
  });
  return ok({ subject }, { status: 201 });
});
