import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre.").max(80),
  email: z.string().trim().toLowerCase().email("El correo no es válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(200),
  educationLevel: z
    .enum(["ESO", "BACHILLERATO", "FP", "UNIVERSIDAD", "OTRO"])
    .default("UNIVERSIDAD"),
});

export const POST = route(async (request: Request) => {
  const body = schema.parse(await request.json());

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return fail("Ya existe una cuenta con ese correo.", 409, "EMAIL_TAKEN");
  }

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash: await hashPassword(body.password),
      educationLevel: body.educationLevel,
    },
  });

  await createSession(user.id);
  return ok({ id: user.id, name: user.name, email: user.email }, { status: 201 });
});
