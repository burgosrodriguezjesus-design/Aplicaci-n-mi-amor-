/**
 * Voz del audio cuando lee el propio dispositivo: qué voz usar y con qué
 * estilo. Se guarda en cada dispositivo, porque cada uno trae sus voces.
 *
 *  - «Natural»: la voz tal cual.
 *  - «Mago sabio»: una voz masculina, más grave y pausada, como la de un
 *    viejo profesor contando una historia (no imita a nadie en concreto).
 */

export type EstiloVoz = "natural" | "mago";

export const ESTILOS_VOZ: { value: EstiloVoz; label: string; hint: string; icon: string }[] = [
  { value: "natural", label: "Natural", hint: "La voz de tu dispositivo, tal cual", icon: "volume" },
  { value: "mago", label: "Mago sabio", hint: "Grave, pausada y cálida, como un viejo profesor", icon: "wand" },
];

/** Tono y ritmo de cada estilo (el ritmo se multiplica por la velocidad elegida). */
const AJUSTES: Record<EstiloVoz, { pitch: number; ritmo: number }> = {
  natural: { pitch: 1, ritmo: 1 },
  mago: { pitch: 0.72, ritmo: 0.86 },
};

const CLAVE_ESTILO = "alicia-voz-estilo";
const CLAVE_VOZ = "alicia-voz-nombre";

function leer(clave: string) {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string | null) {
  try {
    if (valor) window.localStorage.setItem(clave, valor);
    else window.localStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento (modo privado): se usa lo de por defecto.
  }
}

export function estiloGuardado(): EstiloVoz {
  const valor = typeof window === "undefined" ? null : leer(CLAVE_ESTILO);
  return valor === "mago" ? "mago" : "natural";
}

export function guardarEstilo(estilo: EstiloVoz) {
  escribir(CLAVE_ESTILO, estilo === "natural" ? null : estilo);
}

export function vozGuardada(): string | null {
  return typeof window === "undefined" ? null : leer(CLAVE_VOZ);
}

export function guardarVoz(nombre: string | null) {
  escribir(CLAVE_VOZ, nombre);
}

export function ajustesDe(estilo: EstiloVoz) {
  return AJUSTES[estilo];
}

/** Voces masculinas en español que traen iPhone, Android, Windows y Mac. */
const MASCULINAS =
  /\b(jorge|diego|juan|carlos|enrique|pablo|[aá]lvaro|ra[uú]l|andr[eé]s|jos[eé]|antonio|miguel|gonzalo|tom[aá]s|jaime|mart[ií]n|arnau|alonso|dar[ií]o|gerardo|lorenzo|federico|abuelo|reed|rocko|eddy|male|hombre|masculin)/i;
/** Voces de más calidad: suenan menos a robot. */
const BUENAS = /(natural|premium|mejorada|enhanced|neural|online|siri)/i;

function esEspanol(voz: SpeechSynthesisVoice) {
  return /^es/i.test(voz.lang);
}

/**
 * La voz con la que leer: la que eligió la persona si la hay; si no, para
 * el «mago» una masculina (mejor de España y de buena calidad) y para
 * «natural» la primera en español de España.
 */
export function elegirVoz(voces: SpeechSynthesisVoice[], estilo: EstiloVoz, preferida?: string | null) {
  if (preferida) {
    const exacta = voces.find((voz) => voz.name === preferida);
    if (exacta) return exacta;
  }
  const espanolas = voces.filter(esEspanol);
  if (estilo === "mago") {
    const masculinas = espanolas.filter((voz) => MASCULINAS.test(voz.name));
    const puntuar = (voz: SpeechSynthesisVoice) =>
      (BUENAS.test(voz.name) ? 4 : 0) + (/^es[-_]ES/i.test(voz.lang) ? 2 : 0) + (/abuelo|reed|rocko|eddy/i.test(voz.name) ? -3 : 0);
    const mejor = [...masculinas].sort((a, b) => puntuar(b) - puntuar(a))[0];
    if (mejor) return mejor;
  }
  return espanolas.find((voz) => /^es[-_]ES/i.test(voz.lang)) ?? espanolas[0] ?? null;
}

/** Frase de muestra para escuchar el estilo antes de usarlo. */
export const FRASE_DE_PRUEBA =
  "Ah, querido estudiante. El conocimiento, como la buena magia, se aprende poco a poco. Empecemos por el primer tema.";

/** Lee una frase con el estilo y la voz indicados (para «Escuchar»). */
export function probarVoz(estilo: EstiloVoz, preferida?: string | null, texto = FRASE_DE_PRUEBA) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const sintetizador = window.speechSynthesis;
  sintetizador.cancel();
  const frase = new SpeechSynthesisUtterance(texto);
  frase.lang = "es-ES";
  const voz = elegirVoz(sintetizador.getVoices(), estilo, preferida);
  if (voz) {
    frase.voice = voz;
    frase.lang = voz.lang;
  }
  const { pitch, ritmo } = ajustesDe(estilo);
  frase.pitch = pitch;
  frase.rate = ritmo;
  sintetizador.speak(frase);
  return true;
}
