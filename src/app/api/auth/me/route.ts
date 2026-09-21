import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { ok, route } from "@/lib/api";
import { publicCapabilities } from "@/lib/env";

export const GET = route(async () => {
  const user = await getCurrentUser();
  return ok({ user, capabilities: publicCapabilities() });
});

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  educationLevel: z.enum(["ESO", "BACHILLERATO", "FP", "UNIVERSIDAD", "OTRO"]).optional(),
  explanationStyle: z.enum(["CERO", "NORMAL", "AVANZADO"]).optional(),
  summaryDepth: z.enum(["RAPIDO", "NORMAL", "DETALLADO", "MUY_DETALLADO"]).optional(),
  preferredVoice: z.string().max(120).nullable().optional(),
  playbackRate: z.number().min(0.5).max(3).optional(),
});

export const PATCH = route(async (request: Request) => {
  const current = await requireUser();
  const body = schema.parse(await request.json());
  const user = await prisma.user.update({
    where: { id: current.id },
    data: body,
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
  return ok({ user });
});
