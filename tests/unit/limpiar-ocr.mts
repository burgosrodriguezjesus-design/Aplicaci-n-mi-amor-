/**
 * La limpieza del texto leído de páginas escaneadas arregla los defectos del
 * escaneo sin tocar el contenido.
 *
 *   npx tsx tests/unit/limpiar-ocr.mts
 */
import { limpiarTextoOcr } from "../../src/lib/pdf/limpiar-ocr";

let fallos = 0;
function igual(titulo: string, obtenido: string, esperado: string) {
  const ok = obtenido === esperado;
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo);
  if (!ok) {
    fallos += 1;
    console.log("      esperado: " + JSON.stringify(esperado));
    console.log("      obtenido: " + JSON.stringify(obtenido));
  }
}

igual("une palabras partidas a final de línea",
  limpiarTextoOcr("el conoci-\nmiento científico"), "el conocimiento científico");
igual("no une nombres propios con guion",
  limpiarTextoOcr("el tramo Madrid-\nBarcelona"), "el tramo Madrid-\nBarcelona");
igual("quita líneas de manchas del escáner",
  limpiarTextoOcr("Tema 1\n~ ,\n|\nIntroducción"), "Tema 1\nIntroducción");
igual("conserva las fórmulas", limpiarTextoOcr("V = I x R\n230 V"), "V = I x R\n230 V");
igual("conserva la numeración suelta", limpiarTextoOcr("3.\nApartado"), "3.\nApartado");
igual("normaliza ligaduras y comillas",
  limpiarTextoOcr("la ﬁcha “básica”"), 'la ficha "básica"');
igual("colapsa espacios y líneas en blanco de más",
  limpiarTextoOcr("uno   dos\n\n\n\ntres  "), "uno dos\n\ntres");
igual("respeta los párrafos", limpiarTextoOcr("uno\n\ndos"), "uno\n\ndos");

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nLa limpieza del texto leído funciona");
process.exit(fallos ? 1 : 0);
