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

import { direccion as direccionBaseDeDatos } from "./prisma-schema.mjs";
import { esDirectaDeSupabase, urlParaMigrar, variablesDeBaseDeDatos } from "./db-url.mjs";

function ejecutar(orden, args) {
  return new Promise((resolve) => {
    const hijo = spawn(orden, args, { cwd: raiz, stdio: "inherit", env: process.env });
    hijo.on("exit", (codigo) => resolve(codigo ?? 1));
  });
}

const url = direccionBaseDeDatos();
const enVercel = Boolean(process.env.VERCEL);

const faltaBaseDeDatos = enVercel && !/^postgres(ql)?:\/\//i.test(url);

if (faltaBaseDeDatos) {
  // No se corta el despliegue: es mejor que la aplicación llegue a abrirse y
  // explique lo que falta, a que la primera vez solo se vea un error rojo.
  console.warn(
    "\n⚠ Todavía no hay base de datos.\n\n" +
      "  La aplicación se publicará igual, pero al abrirla te dirá que falta.\n" +
      "  Para terminar, desde el panel del proyecto:\n\n" +
      "      Storage → Create Database → Postgres\n\n" +
      "  Vercel añade la variable sola. Después, Deployments → Redeploy.\n",
  );
}

// Si viene con otro nombre, se normaliza para que Prisma la encuentre.
if (url) process.env.DATABASE_URL = url;
else if (!enVercel) process.env.DATABASE_URL = "file:./dev.db";

if (faltaBaseDeDatos) {
  const vistas = variablesDeBaseDeDatos();
  console.warn(
    "  Variables de base de datos que se ven al construir: " +
      (vistas.length ? vistas.join(", ") : "ninguna") +
      "\n",
  );
}

const pasos = [
  ["node", ["scripts/prisma-schema.mjs"]],
  ["npx", ["prisma", "generate", "--schema=" + SCHEMA]],
  ["npx", ["prisma", "db", "push", "--schema=" + SCHEMA, "--skip-generate"]],
];

// Crear las tablas no funciona por el pooler en modo transaccion: para ese
// paso se usa la direccion que si lo admite (ver scripts/db-url.mjs).
const paraMigrar = url ? urlParaMigrar(url) : "";

for (const [orden, args] of pasos) {
  const esPush = args.includes("push");
  const previa = process.env.DATABASE_URL;
  if (esPush && paraMigrar) process.env.DATABASE_URL = paraMigrar;
  const codigo = await ejecutar(orden, args);
  if (esPush) process.env.DATABASE_URL = previa;
  if (codigo === 0) continue;

  // Sin base de datos, `db push` falla por definición: ya se ha avisado y la
  // aplicación lo explicará al abrirse. Cualquier otro fallo sí corta.
  if (faltaBaseDeDatos && args.includes("push")) continue;

  console.error(`\n✗ Ha fallado: ${orden} ${args.join(" ")}\n`);
  if (esPush && esDirectaDeSupabase(url)) {
    console.error(
      "  Has puesto la conexión DIRECTA de Supabase (db.xxx.supabase.co), que en el\n" +
        "  plan gratuito solo funciona por IPv6 y Vercel no siempre llega.\n\n" +
        "  En Supabase: botón «Connect» → pestaña «ORMs» o «Connection string» →\n" +
        "  elige «Transaction pooler» (puerto 6543) y copia esa. Ponla como\n" +
        "  DATABASE_URL en Vercel y vuelve a desplegar.\n",
    );
  }
  process.exit(codigo);
}

console.log(faltaBaseDeDatos ? "Publicada, pendiente de base de datos." : "Base de datos lista.");
