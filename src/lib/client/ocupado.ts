/**
 * Cuenta las subidas en curso, para que la aplicacion no se recargue sola
 * (al detectar una version nueva) a mitad de subir un PDF.
 */
let subidas = 0;

export function empiezaSubida() {
  subidas += 1;
}

export function terminaSubida() {
  subidas = Math.max(0, subidas - 1);
}

export function hayTrabajoEnCurso() {
  return subidas > 0;
}
