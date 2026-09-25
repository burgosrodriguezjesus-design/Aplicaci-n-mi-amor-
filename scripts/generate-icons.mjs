/**
 * Genera los iconos PNG de la PWA a partir de public/icon.svg (el mismo
 * logo que se ve en la app).
 * Uso: node scripts/generate-icons.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const svg = await readFile("public/icon.svg", "utf8");

/** El icono normal: el SVG tal cual. */
async function normal(size) {
  const canvas = createCanvas(size, size);
  const img = await loadImage(Buffer.from(svg.replace("<svg ", `<svg width="${size}" height="${size}" `)));
  canvas.getContext("2d").drawImage(img, 0, 0, size, size);
  return canvas.toBuffer("image/png");
}

/**
 * El "maskable" (Android recorta en círculo o gota): fondo a sangre y el
 * dibujo dentro de la zona segura (80 % central).
 */
async function maskable(size) {
  const sinEsquinas = svg.replace('rx="16"', 'rx="0"');
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const fondo = await loadImage(Buffer.from(sinEsquinas.replace("<svg ", `<svg width="${size}" height="${size}" `)));
  ctx.drawImage(fondo, 0, 0, size, size);
  // Se repinta el fondo encima (sin la letra) y la letra más pequeña.
  const soloFondo = sinEsquinas.replace(/<circle[\s\S]*<\/svg>/, "</svg>");
  ctx.drawImage(await loadImage(Buffer.from(soloFondo.replace("<svg ", `<svg width="${size}" height="${size}" `))), 0, 0, size, size);
  const letra = sinEsquinas.replace(/<rect width="64" height="64"[^>]*\/>/, "");
  const dentro = Math.round(size * 0.72);
  const img = await loadImage(Buffer.from(letra.replace("<svg ", `<svg width="${dentro}" height="${dentro}" `)));
  ctx.drawImage(img, (size - dentro) / 2, (size - dentro) / 2, dentro, dentro);
  return canvas.toBuffer("image/png");
}

await writeFile("public/icons/icon-192.png", await normal(192));
await writeFile("public/icons/icon-512.png", await normal(512));
await writeFile("public/icons/icon-maskable-512.png", await maskable(512));
console.log("Iconos generados en public/icons/");
