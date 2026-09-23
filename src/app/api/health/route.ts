/**
 * Comprobación de salud.
 *
 * La usa el alojamiento para saber si la aplicación está viva, y tú para saber
 * si está bien montada: comprueba de verdad que la base de datos responde y
 * que el almacenamiento guarda, lee y borra. Si algo falta, lo dice con
 * nombre y apellidos en vez de esperar a que falle al subir el primer PDF.
 *
 * No devuelve nada privado: ni rutas, ni credenciales, ni datos de nadie.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env, nombresDeBaseDeDatosVistos } from "@/lib/env";
import { versionPublicada } from "@/lib/setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function comprobarBaseDeDatos() {
  // Se dicen los NOMBRES de las variables que hay puestas, nunca sus valores:
  // saber si la base de datos esta conectada es media diagnostico.
  const variables = nombresDeBaseDeDatosVistos();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true as const, variables };
  } catch (error) {
    return { ok: false as const, error: mensaje(error), variables };
  }
}

async function comprobarAlmacenamiento() {
  // Un fichero minúsculo con nombre único: se guarda, se lee y se borra.
  const clave = `health/${randomUUID()}.txt`;
  const contenido = Buffer.from("estudia-ok");
  try {
    const { storage } = await import("@/lib/storage");
    await storage.put(clave, contenido, "text/plain");
    const leido = await storage.get(clave);
    await storage.delete(clave);
    if (!leido.equals(contenido)) {
      return { ok: false as const, error: "lo leído no coincide con lo guardado" };
    }
    return { ok: true as const };
  } catch (error) {
    await import("@/lib/storage")
      .then(({ storage }) => storage.delete(clave))
      .catch(() => undefined);
    return { ok: false as const, error: mensaje(error) };
  }
}

function mensaje(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  const [database, storage] = await Promise.all([
    comprobarBaseDeDatos(),
    comprobarAlmacenamiento(),
  ]);

  const ok = database.ok && storage.ok;
  return NextResponse.json(
    {
      ok,
      version: versionPublicada(),
      database,
      storage: { ...storage, driver: env.storage.driver },
    },
    { status: ok ? 200 : 503 },
  );
}
