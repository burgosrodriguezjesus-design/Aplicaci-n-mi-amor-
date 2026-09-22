/** Cliente Prisma como singleton (evita agotar conexiones en desarrollo). */
// `env` se importa primero a proposito: normaliza DATABASE_URL (Vercel la
// inyecta con otros nombres) antes de que Prisma la lea.
import "./env";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
