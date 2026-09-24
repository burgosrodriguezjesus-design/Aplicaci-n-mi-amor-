import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";
import {
  BYTES_POR_TROZO,
  claveDeTrozo,
  idDeSubidaValido,
  totalDeTrozos,
} from "@/lib/documents/trozos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guarda un trozo del PDF. El cuerpo son los bytes tal cual. */
export const PUT = route(
  async (
    request: Request,
    { params }: { params: Promise<{ uploadId: string; part: string }> },
  ) => {
    const user = await requireUser();
    const { uploadId, part } = await params;
    const parte = Number(part);

    if (
      !idDeSubidaValido(uploadId) ||
      !Number.isInteger(parte) ||
      parte < 0 ||
      parte >= totalDeTrozos(env.limits.maxUploadBytes)
    ) {
      return fail("Trozo de subida no válido.", 400, "BAD_PART");
    }

    const datos = Buffer.from(await request.arrayBuffer());
    if (datos.length === 0) return fail("El trozo ha llegado vacío.", 400, "EMPTY_PART");
    if (datos.length > BYTES_POR_TROZO) {
      return fail("El trozo es demasiado grande.", 413, "PART_TOO_LARGE");
    }

    await storage.put(claveDeTrozo(user.id, uploadId, parte), datos, "application/octet-stream");
    return ok({ received: datos.length });
  },
);
