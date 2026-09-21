/**
 * Autenticacion por cookie httpOnly firmada (JWT / HS256).
 *
 * - La contrasena se guarda como hash bcrypt, nunca en claro.
 * - La cookie es httpOnly + sameSite=lax + secure en produccion,
 *   por lo que no es accesible desde JavaScript del cliente.
 */
import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { env } from "./env";
import { prisma } from "./db";

const COOKIE = "estudia_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias
const key = new TextEncoder().encode(env.authSecret);

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  educationLevel: string;
  explanationStyle: string;
  summaryDepth: string;
  preferredVoice: string | null;
  playbackRate: number;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key);

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Devuelve el usuario de la sesion actual, o null si no hay sesion valida. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, key);
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        educationLevel: true,
        explanationStyle: true,
        summaryDepth: true,
        preferredVoice: true,
        playbackRate: true,
      },
    });
    return user;
  } catch {
    return null;
  }
}

/** Igual que getCurrentUser pero lanza un error 401 tipado en rutas de API. */
export class UnauthorizedError extends Error {
  constructor() {
    super("No has iniciado sesion.");
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
