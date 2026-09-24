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
import { elegirDireccion } from "./db-url.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origen = path.join(raiz, "prisma", "schema.prisma");
const destino = path.join(raiz, "prisma", "schema.runtime.prisma");

/**
 * La direccion de la base de datos, venga con el nombre que venga (tambien con
 * el prefijo que pone Vercel, como `estudia_DATABASE_URL`). Ver scripts/db-url.mjs.
 */
export function direccion(entorno = process.env) {
  return elegirDireccion(entorno);
}

/**
 * "postgresql" o "sqlite", según la URL de conexión.
 *
 * En un alojamiento en la nube **siempre** es PostgreSQL, aunque al construir
 * todavía no se vea la direccion: el cliente de Prisma se genera con el motor
 * grabado dentro, y si se construyera para SQLite y luego llegara una base de
 * datos de verdad, la rechazaria. Eso es justo lo que hacia que, despues de
 * crear la base de datos, la aplicacion siguiera diciendo que faltaba.
 */
export function motorDe(url, entorno = process.env) {
  if (/^postgres(ql)?:\/\//i.test(url || "")) return "postgresql";
  if (/^mysql:\/\//i.test(url || "")) return "mysql";
  if (entorno.VERCEL || entorno.RENDER || entorno.FLY_APP_NAME) return "postgresql";
  return "sqlite";
}

const motor = motorDe(direccion());
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
