/**
 * Elección de la voz del dispositivo según el estilo («Natural» o «Mago
 * sabio»), con las voces que traen de verdad iPhone, Android y Windows.
 *
 *   npx tsx tests/unit/voz.mts
 */
const { elegirVoz, ajustesDe } = await import("../../src/lib/client/voz");

let fallos = 0;
function comprobar(titulo: string, ok: boolean, detalle = "") {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo + (!ok && detalle ? ` — ${detalle}` : ""));
  if (!ok) fallos += 1;
}
const v = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

const iphone = [v("Mónica", "es-ES"), v("Paulina", "es-MX"), v("Abuelo (español (España))", "es-ES"), v("Jorge", "es-ES"), v("Juan", "es-MX"), v("Samantha", "en-US")];
const iphoneMejorada = [...iphone, v("Jorge (mejorada)", "es-ES")];
const windows = [v("Microsoft Helena - Spanish (Spain)", "es-ES"), v("Microsoft Laura - Spanish (Spain)", "es-ES"), v("Microsoft Pablo - Spanish (Spain)", "es-ES"), v("Microsoft Alvaro Online (Natural) - Spanish (Spain)", "es-ES")];
const android = [v("Google español", "es-ES"), v("Google español de Estados Unidos", "es-US")];

comprobar("iPhone: el mago usa a Jorge (masculina de España)", elegirVoz(iphone, "mago")?.name === "Jorge", elegirVoz(iphone, "mago")?.name);
comprobar("iPhone: la versión mejorada, si está descargada", elegirVoz(iphoneMejorada, "mago")?.name === "Jorge (mejorada)");
comprobar("Windows: el mago usa a Álvaro (natural)", /Alvaro/.test(elegirVoz(windows, "mago")?.name ?? ""), elegirVoz(windows, "mago")?.name);
comprobar("Android sin voces masculinas: una en español igualmente", elegirVoz(android, "mago")?.name === "Google español");
comprobar("natural: la primera de España", elegirVoz(iphone, "natural")?.name === "Mónica");
comprobar("la voz elegida a mano manda", elegirVoz(iphone, "mago", "Paulina")?.name === "Paulina");
comprobar("si la elegida no está en este dispositivo, la automática", elegirVoz(iphone, "mago", "Inventada")?.name === "Jorge");
comprobar("nunca una voz en inglés", elegirVoz([v("Daniel", "en-GB")], "mago") === null);
comprobar("el mago es más grave y pausado", ajustesDe("mago").pitch < 1 && ajustesDe("mago").ritmo < 1);
comprobar("natural no cambia nada", ajustesDe("natural").pitch === 1 && ajustesDe("natural").ritmo === 1);

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nVoces bien elegidas");
process.exit(fallos ? 1 : 0);
