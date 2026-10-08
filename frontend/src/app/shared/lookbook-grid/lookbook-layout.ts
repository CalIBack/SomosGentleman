/**
 * Motor de la grilla del lookbook.
 *
 * El usuario decide dos cosas de cada foto:
 *   - su ORDEN dentro del álbum
 *   - su TAMAÑO: ancho en pasos de 25% (w = 1 a 4 "cuartos") y alto en filas (h)
 *
 * La POSICIÓN no se guarda: se calcula acá según cuántas columnas entran en la
 * pantalla. Así el mismo lookbook se ve como álbum en cualquier dispositivo:
 *
 *   ancho elegido   compu (4 col.)   tablet (3 col.)   celular (2 col.)
 *   25%             1 de 4           1 de 3            media fila (2 por fila)
 *   50%             2 de 4           2 de 3            fila entera
 *   75% / 100%      3 o 4 de 4       fila entera       fila entera
 *
 * Las celdas son cuadradas, así que una foto vertical (1x2) sigue siendo
 * vertical en cualquier pantalla.
 *
 * Son funciones puras: no tocan el DOM ni Angular, por eso se pueden probar solas.
 */

/** Lo que se guarda de cada foto: identificador y tamaño */
export interface Celda {
  id: string;
  w: number; // ancho en cuartos del álbum: 1 = 25%, 2 = 50%, 3 = 75%, 4 = 100%
  h: number; // alto en filas
}

/** Una foto ya ubicada en la grilla (posición calculada, no guardada) */
export type Ubicada<T extends Celda> = T & { x: number; y: number; ancho: number };

/** Límites de tamaño. Coinciden con lo que valida el backend. */
export const ANCHO_MAXIMO = 4;
export const ALTO_MAXIMO = 4;

/**
 * Cuántas columnas usar según el ancho disponible. Funciona como un media query,
 * pero mide el espacio real de la grilla: en el editor, con el panel lateral,
 * la grilla es más angosta que la pantalla y esto lo tiene en cuenta.
 */
export function columnasPara(anchoPx: number): number {
  if (anchoPx >= 760) return 4;
  if (anchoPx >= 500) return 3;
  return 2;
}

/** Cuántas columnas reales ocupa una foto de w cuartos en una grilla de n columnas */
export function anchoEnColumnas(w: number, columnas: number): number {
  return Math.min(Math.max(1, w), columnas);
}

/** Texto para mostrar el ancho elegido, ej: "50%" */
export function porcentaje(w: number): string {
  return `${Math.min(Math.max(1, w), ANCHO_MAXIMO) * 25}%`;
}

function colisionan(
  a: { x: number; y: number; ancho: number; h: number },
  b: { x: number; y: number; ancho: number; h: number }
): boolean {
  return a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Ubica las fotos en orden, cada una en el primer lugar libre donde entra
 * (de izquierda a derecha y de arriba hacia abajo). Una foto chica puede
 * rellenar un hueco que dejó una grande, así el álbum queda compacto.
 *
 * Devuelve las fotos en el mismo orden, con x, y y el ancho real en columnas.
 * El w elegido por el usuario no se modifica: si en el celular una foto de
 * 75% ocupa toda la fila, en la compu vuelve a ocupar 3 de 4.
 */
export function empaquetar<T extends Celda>(items: T[], columnas: number): Ubicada<T>[] {
  const ubicadas: Ubicada<T>[] = [];

  for (const item of items) {
    const ancho = anchoEnColumnas(item.w, columnas);
    const h = Math.min(Math.max(1, item.h), ALTO_MAXIMO);

    let lugar: { x: number; y: number } | null = null;
    for (let y = 0; !lugar; y++) {
      for (let x = 0; x + ancho <= columnas; x++) {
        if (!ubicadas.some(u => colisionan({ x, y, ancho, h }, u))) {
          lugar = { x, y };
          break;
        }
      }
    }
    ubicadas.push({ ...item, h, ancho, x: lugar.x, y: lugar.y });
  }
  return ubicadas;
}

/** Cantidad de filas que ocupa la grilla */
export function filaFinal(items: { y: number; h: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.y + i.h), 0);
}

/** Devuelve una lista nueva con el elemento movido a otra posición */
export function moverEnLista<T>(lista: T[], desde: number, hasta: number): T[] {
  const copia = [...lista];
  const [elemento] = copia.splice(desde, 1);
  copia.splice(hasta, 0, elemento);
  return copia;
}

/**
 * Decide a qué posición del orden va la foto que se arrastra, según la celda
 * donde está el puntero:
 *   - sobre otra foto: toma su lugar en el orden y la empuja
 *   - debajo de todo: pasa al final
 *   - en un hueco del medio: no cambia
 */
export function indiceDestino<T extends Celda>(
  ubicadas: Ubicada<T>[],
  idArrastrada: string,
  celda: { x: number; y: number }
): number {
  const actual = ubicadas.findIndex(u => u.id === idArrastrada);
  const debajo = ubicadas.findIndex(u =>
    u.id !== idArrastrada &&
    celda.x >= u.x && celda.x < u.x + u.ancho &&
    celda.y >= u.y && celda.y < u.y + u.h
  );

  if (debajo !== -1) return debajo;
  if (celda.y >= filaFinal(ubicadas)) return ubicadas.length - 1;
  return actual;
}

/**
 * Tamaño inicial según la forma real de la foto, para que el recorte de
 * object-fit: cover sea mínimo: apaisada 50% x 1 fila, vertical 25% x 2 filas,
 * cuadrada 25% x 1 fila.
 */
export function tamanioInicial(ancho: number, alto: number): { w: number; h: number } {
  if (!ancho || !alto) return { w: 1, h: 1 };
  const proporcion = ancho / alto;
  if (proporcion >= 1.4) return { w: 2, h: 1 };
  if (proporcion <= 0.72) return { w: 1, h: 2 };
  return { w: 1, h: 1 };
}
