/**
 * Autenticacion por cookie httpOnly firmada (JWT / HS256).
 *
 * - La contrasena se guarda como hash bcrypt, nunca en claro.
 * - La cookie es httpOnly + sameSite=lax + secure en produccion,
 *   por lo que no es accesible desde JavaScript del cliente.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { env } from "./env";
import { prisma } from "./db";

const COOKIE = "estudia_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

/**
 * Clave con la que se firman las sesiones.
 *
 * Si no viene por entorno se genera una y se guarda en la base de datos. Es lo
 * que permite publicar la aplicacion sin configurar nada: tiene que ser
 * estable -si cambiara, se cerrarian todas las sesiones- y no puede vivir en
 * el disco, porque en un alojamiento sin servidor no hay disco que dure.
 */
let claveEnMemoria: Uint8Array | null = null;

export async function claveDeFirma(): Promise<Uint8Array> {
  if (claveEnMemoria) return claveEnMemoria;

  if (env.authSecret) {
    claveEnMemoria = new TextEncoder().encode(env.authSecret);
    return claveEnMemoria;
  }

  const guardada = await prisma.setting.findUnique({ where: { key: "auth-secret" } });
  if (guardada) {
    claveEnMemoria = new TextEncoder().encode(guardada.value);
    return claveEnMemoria;
  }

  const nueva = randomBytes(48).toString("base64");
  // `create` puede chocar si dos peticiones llegan a la vez: gana la primera
  // y la segunda se queda con la que ya hay.
  const fijada = await prisma.setting
    .create({ data: { key: "auth-secret", value: nueva } })
    .catch(() => prisma.setting.findUnique({ where: { key: "auth-secret" } }));

  claveEnMemoria = new TextEncoder().encode(fijada?.value ?? nueva);
  return claveEnMemoria;
}

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
    .sign(await claveDeFirma());

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
    const { payload } = await jwtVerify(token, await claveDeFirma());
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
