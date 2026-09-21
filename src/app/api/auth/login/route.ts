import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("El correo no es válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export const POST = route(async (request: Request) => {
  const body = schema.parse(await request.json());
  const user = await prisma.user.findUnique({ where: { email: body.email } });

  // Mensaje idéntico en ambos casos para no revelar qué correos existen.
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return fail("Correo o contraseña incorrectos.", 401, "INVALID_CREDENTIALS");
  }

  await createSession(user.id);
  return ok({ id: user.id, name: user.name, email: user.email });
});
