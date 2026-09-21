/** Utilidades compartidas por las rutas de API: respuestas y errores uniformes. */
import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "./auth";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(
  message: string,
  status = 400,
  code = "BAD_REQUEST",
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

/** Convierte cualquier excepción en una respuesta JSON con mensaje claro. */
export function handleError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return fail("Necesitas iniciar sesión para continuar.", 401, "UNAUTHORIZED");
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return fail(
      first?.message ?? "Los datos enviados no son válidos.",
      422,
      "VALIDATION_ERROR",
      { issues: error.issues },
    );
  }
  const code = (error as { code?: string })?.code;
  const message =
    error instanceof Error ? error.message : "Ha ocurrido un error inesperado.";

  if (code === "AI_UNAVAILABLE" || code === "TTS_UNAVAILABLE") {
    return fail(message, 503, code);
  }
  if (process.env.NODE_ENV !== "production") console.error(error);
  return fail(message, 500, code ?? "INTERNAL_ERROR");
}

/** Envuelve un manejador de ruta con el tratamiento de errores estándar. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleError(error);
    }
  };
}
