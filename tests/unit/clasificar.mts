/**
 * ¿Qué es temario y qué no? Frases de libros de texto que deben (o no deben)
 * tomarse por ejemplo, ejercicio, actividad, crédito o testimonio.
 *
 *   npx tsx tests/unit/clasificar.mts
 */
const c = await import("../../src/lib/pdf/clasificar");

let fallos = 0;
function comprobar(titulo: string, ok: boolean) {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo);
  if (!ok) fallos += 1;
}

console.log("Teoría que se queda como teoría");
const teoria = [
  "El impuesto sobre el valor añadido (IVA) es un tributo indirecto que grava el consumo.",
  "Representa la diferencia entre el IVA repercutido y el soportado.",
  "Indica el nivel de existencias en el que hay que realizar un nuevo pedido.",
  "Calcula un precio medio cada vez que entra una partida.",
  "En la práctica, las empresas liquidan el impuesto cada trimestre.",
  "Web 2.0 es el nombre que recibe la segunda generación de servicios de internet.",
  "La Ley 37/1992 regula el impuesto sobre el valor añadido.",
  "El tipo general del 21 % se aplica a la mayoría de los bienes.",
  "Análisis de la cuenta de resultados de la empresa.",
  "Punto de pedido = stock de seguridad + consumo medio diario × plazo de entrega",
];
for (const frase of teoria) {
  const mal =
    c.esFraseDeEjemplo(frase) ||
    c.esEnunciado(frase) ||
    c.esCredito(frase) ||
    c.esTestimonio(frase) ||
    c.empiezaEjemplo(frase) ||
    c.empiezaCuriosidad(frase) ||
    c.esTituloDePractica(frase);
  comprobar(`teoría: «${frase.slice(0, 55)}…»`, !mal);
}
comprobar("una fórmula con nombres no es un cálculo", !c.esCalculoConCifras(teoria[9]));

console.log("\nEjemplos");
for (const frase of [
  "La empresa Muebles Ortega, S.L. vende una mesa por 500 € más IVA.",
  "Por ejemplo, si Lucía compra una lámpara de 80 €, paga 16,80 € de IVA.",
  "Supongamos que una tienda vende 20 camisetas.",
  "El Sr. García compra mercaderías a crédito.",
  "El IVA repercutido es 500 × 21 % = 105 €.",
]) comprobar(`ejemplo: «${frase.slice(0, 55)}»`, c.esFraseDeEjemplo(frase));
comprobar("«Ejemplo 4.1. La empresa…» empieza un ejemplo", c.empiezaEjemplo("Ejemplo 4.1. La empresa Ortega vende…"));
comprobar("«Ejemplo resuelto» empieza un ejemplo", c.empiezaEjemplo("Ejemplo resuelto"));
comprobar("«500 × 21 % = 105 €» es un cálculo, no una fórmula", c.esCalculoConCifras("500 × 21 % = 105 €"));

console.log("\nActividades y ejercicios");
for (const titulo of ["Actividades", "ACTIVIDADES FINALES", "Test de autoevaluación", "Caso práctico 2", "Ejercicios resueltos", "Comprueba lo que has aprendido"]) {
  comprobar(`título de práctica: «${titulo}»`, c.esTituloDePractica(titulo));
}
for (const titulo of ["Prácticas comerciales desleales", "Evaluación de riesgos laborales", "Problemas de liquidez"]) {
  comprobar(`título de temario: «${titulo}»`, !c.esTituloDePractica(titulo));
}
for (const enunciado of [
  "1. Explica la diferencia entre el IVA repercutido y el soportado.",
  "3. ¿Qué modelo presentan las pymes cada trimestre?",
  "b) Calcula la cuota a ingresar.",
  "Calcula en tu cuaderno el IVA de la factura.",
  "¿Qué diferencia hay entre una mercadería y una materia prima?",
]) comprobar(`enunciado: «${enunciado.slice(0, 55)}»`, c.esEnunciado(enunciado));
comprobar("«2. Tipos impositivos» no es un enunciado", !c.esEnunciadoNumerado("2. Tipos impositivos"));

console.log("\nCréditos, editorial y testimonios");
for (const linea of ["Foto: Javier Martínez / Shutterstock", "© Ediciones Didácticas, 2024", "ISBN 978-84-1234-567-8", "Autores: Ana Pérez y Luis Romero", "Fuente: INE, 2023", "www.agenciatributaria.es"]) {
  comprobar(`crédito: «${linea}»`, c.esCredito(linea));
}
comprobar(
  "testimonio de una jefa de almacén",
  c.esTestimonio("«En nuestro almacén hacemos inventario cada trimestre», Laura Gómez, jefa de almacén de Distribuciones Norte."),
);
comprobar("«¿Sabías que…?» es una curiosidad", c.empiezaCuriosidad("¿Sabías que el IVA nació en Francia?"));
comprobar("la curiosidad queda como frase", c.sinMarcaDeCuriosidad("¿Sabías que el IVA nació en Francia?") === "el IVA nació en Francia.");

console.log(fallos ? `\n${fallos} fallos` : "\nSe distingue bien el temario de lo que no lo es");
process.exit(fallos ? 1 : 0);
