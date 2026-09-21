/**
 * Genera los iconos PNG de la PWA a partir del mismo diseño que icon.svg.
 * Uso: node scripts/generate-icons.mjs
 */
import { writeFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";

function draw(size, maskable) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const radius = maskable ? size / 2 : size * 0.234;
  const inset = maskable ? size * 0.12 : 0;

  ctx.fillStyle = "#5b4bd6";
  if (maskable) {
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, radius);
    ctx.fill();
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${size * (maskable ? 0.44 : 0.56)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("E", size / 2, size / 2 + inset * 0.1 + size * 0.02);

  return canvas.toBuffer("image/png");
}

await writeFile("public/icons/icon-192.png", draw(192, false));
await writeFile("public/icons/icon-512.png", draw(512, false));
await writeFile("public/icons/icon-maskable-512.png", draw(512, true));
console.log("Iconos generados en public/icons/");
