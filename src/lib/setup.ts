/**
 * Comprueba si la instalacion esta terminada.
 *
 * Recien publicada en un alojamiento, puede faltar la base de datos. En ese
 * caso es mucho mejor que la aplicacion abra y explique lo que falta, con los
 * pasos, a que la primera vez solo se vea una pantalla de error.
 *
 * Distingue entre "no hay base de datos" y "hay, pero algo no cuadra", porque
 * lo que hay que hacer es distinto y confundirlos hace perder mucho tiempo.
 */
import "server-only";
import { prisma } from "./db";
import { nombresDeBaseDeDatosVistos } from "./env";

export type Pendiente = {
  /** "sin-base" = no hay ninguna configurada. "error" = hay, pero falla. */
  tipo: "sin-base" | "error";
  motivo: string;
  /** Nombres de variables de base de datos presentes. Nunca sus valores. */
  variables: string[];
};

export async function loQueFalta(): Promise<Pendiente | null> {
  const variables = nombresDeBaseDeDatosVistos();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return null;
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    return {
      tipo: variables.length === 0 ? "sin-base" : "error",
      motivo,
      variables,
    };
  }
}
