#!/usr/bin/env node
/**
 * Deja la base de datos lista antes de construir la aplicación.
 *
 * Prepara el esquema para el motor que toque (SQLite o PostgreSQL), genera el
 * cliente y crea o actualiza las tablas. En un alojamiento sin servidor no hay
 * un momento de "arranque" donde hacerlo, así que se hace al construir, que es
 * la única vez que se ejecuta algo con acceso a la base de datos.
 *
 *   node scripts/db-setup.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = "prisma/schema.runtime.prisma";

/** Vercel inyecta la dirección de la base de datos con otros nombres. */
function direccionBaseDeDatos() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    ""
  );
}

function ejecutar(orden, args) {
  return new Promise((resolve) => {
    const hijo = spawn(orden, args, { cwd: raiz, stdio: "inherit", env: process.env });
    hijo.on("exit", (codigo) => resolve(codigo ?? 1));
  });
}

const url = direccionBaseDeDatos();
const enVercel = Boolean(process.env.VERCEL);

if (enVercel && !/^postgres(ql)?:\/\//i.test(url)) {
  console.error(
    "\n✗ Falta la base de datos.\n\n" +
      "  En Vercel, un fichero SQLite no sobrevive: cada petición arranca de cero.\n" +
      "  Crea la base de datos antes de desplegar, desde el panel del proyecto:\n\n" +
      "      Storage → Create Database → Postgres\n\n" +
      "  Vercel añade la variable sola. Después, vuelve a desplegar.\n",
  );
  process.exit(1);
}

process.env.DATABASE_URL = url || "file:./dev.db";

const pasos = [
  ["node", ["scripts/prisma-schema.mjs"]],
  ["npx", ["prisma", "generate", "--schema=" + SCHEMA]],
  ["npx", ["prisma", "db", "push", "--schema=" + SCHEMA, "--skip-generate"]],
];

for (const [orden, args] of pasos) {
  const codigo = await ejecutar(orden, args);
  if (codigo !== 0) {
    console.error(`\n✗ Ha fallado: ${orden} ${args.join(" ")}\n`);
    process.exit(codigo);
  }
}

console.log("Base de datos lista.");
