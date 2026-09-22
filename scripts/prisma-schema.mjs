#!/usr/bin/env node
/**
 * Genera `prisma/schema.runtime.prisma` a partir del esquema del repositorio,
 * poniendo el motor de base de datos que toque.
 *
 * Prisma no permite elegir el motor con una variable de entorno, y esta
 * aplicación tiene que funcionar en los dos sitios:
 *   - SQLite en un fichero, para probarla en casa sin configurar nada,
 *   - PostgreSQL, que es lo que dan gratis los alojamientos (no tienen disco).
 *
 * Se decide mirando DATABASE_URL, así que no hay nada más que configurar.
 * El esquema del repositorio no se toca: el generado va al .gitignore.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origen = path.join(raiz, "prisma", "schema.prisma");
const destino = path.join(raiz, "prisma", "schema.runtime.prisma");

/** "postgresql" o "sqlite", según la URL de conexión. */
export function motorDe(url) {
  if (!url) return "sqlite";
  if (/^postgres(ql)?:\/\//i.test(url)) return "postgresql";
  if (/^mysql:\/\//i.test(url)) return "mysql";
  return "sqlite";
}

const motor = motorDe(process.env.DATABASE_URL);
const esquema = await readFile(origen, "utf8");

const cambiado = esquema.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"[^"]+"/s,
  `$1"${motor}"`,
);

if (cambiado === esquema && !esquema.includes(`provider = "${motor}"`)) {
  throw new Error("No se ha encontrado el bloque datasource en prisma/schema.prisma");
}

await writeFile(
  destino,
  `// GENERADO por scripts/prisma-schema.mjs — no editar a mano.\n` +
    `// Motor elegido a partir de DATABASE_URL: ${motor}.\n\n` +
    cambiado,
);

if (!process.env.PRISMA_SCHEMA_QUIET) {
  console.log(`Esquema preparado para ${motor} → prisma/schema.runtime.prisma`);
}
