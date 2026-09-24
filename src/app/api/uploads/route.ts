import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { BYTES_POR_TROZO, totalDeTrozos } from "@/lib/documents/trozos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inicioSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().nonnegative(),
});

/** Empieza una subida por trozos: dice cuantos trozos y de que tamaño. */
export const POST = route(async (request: Request) => {
  await requireUser();
  const { size } = inicioSchema.parse(await request.json());

  if (size === 0) return fail("El archivo está vacío.", 400, "EMPTY_FILE");
  if (size > env.limits.maxUploadBytes) {
    return fail(
      `El PDF supera el límite de ${env.limits.maxUploadMb} MB.`,
      413,
      "FILE_TOO_LARGE",
    );
  }

  return ok({
    uploadId: randomUUID(),
    chunkBytes: BYTES_POR_TROZO,
    parts: totalDeTrozos(size),
  });
});
