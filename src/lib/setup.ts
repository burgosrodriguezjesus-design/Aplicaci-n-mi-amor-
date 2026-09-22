/**
 * Comprueba si la instalacion esta terminada.
 *
 * Recien publicada en un alojamiento, puede faltar la base de datos. En ese
 * caso es mucho mejor que la aplicacion abra y explique lo que falta, con los
 * pasos, a que la primera vez solo se vea una pantalla de error.
 */
import "server-only";
import { prisma } from "./db";

export type Pendiente = { motivo: string } | null;

export async function loQueFalta(): Promise<Pendiente> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return null;
  } catch (error) {
    return { motivo: error instanceof Error ? error.message : String(error) };
  }
}
