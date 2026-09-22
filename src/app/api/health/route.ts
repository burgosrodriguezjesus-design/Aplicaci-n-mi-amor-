/**
 * Comprobación de salud para el alojamiento.
 *
 * Render (y cualquier otro servicio) llama aquí para saber si la aplicación
 * está viva y si debe reiniciarla. Responde rápido y sin tocar nada privado:
 * solo confirma que el proceso responde y que la base de datos contesta.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "ok" });
  } catch {
    return NextResponse.json({ ok: false, database: "error" }, { status: 503 });
  }
}
