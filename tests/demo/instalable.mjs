/** La aplicación se puede instalar: manifiesto, service worker y aviso. */
import { chromium, devices } from "playwright";
import { navegador } from "./_util.mjs";

const base = process.env.APP_URL || "http://localhost:3000";
let fallos = 0;
const comprobar = (titulo, ok) => {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo);
  if (!ok) fallos += 1;
};

const browser = await chromium.launch({ executablePath: navegador() });

async function entrar(context) {
  const page = await context.newPage();
  await page.goto(base + "/login");
  await page.fill('input[type="email"]', "demo@estudia.local");
  await page.fill('input[type="password"]', "estudia1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/inicio/, { timeout: 30000 });
  return page;
}

// ── 1. El manifiesto y los iconos existen y son coherentes
const plano = await browser.newContext();
const suelta = await plano.newPage();
const manifiesto = await (await suelta.goto(base + "/manifest.webmanifest")).json();
comprobar("el manifiesto declara nombre y arranque",
  manifiesto.name.includes("EstudIA") && manifiesto.start_url === "/inicio");
comprobar("se abre a pantalla completa", manifiesto.display === "standalone");
comprobar("trae icono normal y enmascarable",
  manifiesto.icons.some((i) => i.purpose === "any") &&
  manifiesto.icons.some((i) => i.purpose === "maskable"));
for (const icono of manifiesto.icons) {
  const respuesta = await suelta.request.get(base + icono.src);
  comprobar(`el icono ${icono.sizes} se sirve`, respuesta.ok());
}
const salud = await (await suelta.request.get(base + "/api/health")).json();
comprobar("la comprobación de salud responde", salud.ok === true);
await plano.close();

// ── 2. En un iPhone se explica cómo instalarla (Safari no lo ofrece solo)
const iphone = await browser.newContext({ ...devices["iPhone 13"] });
const movil = await entrar(iphone);
await movil.waitForSelector('[aria-label="Instalar EstudIA"]', { timeout: 20000 });
const texto = await movil.textContent('[aria-label="Instalar EstudIA"]');
comprobar("en iPhone se explica dónde tocar",
  texto.includes("Compartir") && texto.includes("pantalla de inicio"));
comprobar("en iPhone no se enseña un botón de instalar que no existe",
  !(await movil.isVisible('[aria-label="Instalar EstudIA"] button:text-is("Instalar")')));

await movil.click('[aria-label="Instalar EstudIA"] button:text-is("Ahora no")');
comprobar("se puede descartar", !(await movil.isVisible('[aria-label="Instalar EstudIA"]')));
await movil.reload();
await movil.waitForSelector("text=Buenos días,text=Buenas tardes,text=Buenas noches", { timeout: 20000 }).catch(() => null);
comprobar("descartado no vuelve a aparecer",
  !(await movil.isVisible('[aria-label="Instalar EstudIA"]')));
await iphone.close();

// ── 3. Instalada de verdad, el aviso desaparece
const instalada = await browser.newContext({
  ...devices["iPhone 13"],
  // Safari marca así una aplicación añadida a la pantalla de inicio.
});
await instalada.addInitScript(() => {
  Object.defineProperty(window.navigator, "standalone", { value: true });
});
const dentro = await entrar(instalada);
await dentro.waitForTimeout(1500);
comprobar("ya instalada no se ofrece instalar",
  !(await dentro.isVisible('[aria-label="Instalar EstudIA"]')));
await instalada.close();

await browser.close();
console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nLa aplicación es instalable");
process.exit(fallos ? 1 : 0);
