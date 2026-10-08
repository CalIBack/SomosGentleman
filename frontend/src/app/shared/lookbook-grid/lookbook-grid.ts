import {
  Component, ElementRef, AfterViewInit, OnDestroy, HostListener,
  computed, inject, input, model, output, signal, viewChild
} from '@angular/core';
import { LookbookService } from '../../services/lookbook';
import {
  ALTO_MAXIMO, ANCHO_MAXIMO, Celda, Ubicada,
  columnasPara, empaquetar, filaFinal, indiceDestino, moverEnLista, porcentaje
} from './lookbook-layout';

/** Una foto del lookbook: tamaño elegido + lo necesario para dibujarla */
export interface FotoGrilla extends Celda {
  ruta: string;        // ruta guardada en el backend ('' mientras se sube)
  previa?: string;     // vista previa local (blob:) para mostrarla antes de que termine de subir
  subiendo?: boolean;
}

interface Arrastre {
  id: string;
  modo: 'mover' | 'redimensionar';
  origen: Ubicada<FotoGrilla>; // la foto tal como estaba al empezar
  inicioX: number;             // posición del puntero al empezar
  inicioY: number;
  agarreX: number;             // en qué punto de la foto se la agarró
  agarreY: number;
  libreX: number;              // posición en px de la foto mientras sigue al puntero
  libreY: number;
  ultimoObjetivo: string | null;
}

/**
 * Grilla del lookbook.
 *
 * - editable = true: se pueden reordenar fotos arrastrándolas, cambiar su tamaño
 *   desde la esquina, quitarlas y soltar archivos encima.
 * - editable = false: solo muestra; al hacer clic se abre la foto completa (sin recorte).
 * - miniatura = true: versión chica para las tarjetas del listado, sin interacción.
 *
 * La cantidad de columnas NO la elige el usuario: sale del ancho disponible
 * (columnasPara), salvo que el padre la fije con [columnasFijas] (por ejemplo,
 * para previsualizar cómo se ve en un celular).
 */
@Component({
  selector: 'app-lookbook-grid',
  standalone: true,
  templateUrl: './lookbook-grid.html',
  styleUrl: './lookbook-grid.scss'
})
export class LookbookGridComponent implements AfterViewInit, OnDestroy {
  private lookbookService = inject(LookbookService);

  // model(): el padre lo lee y además se entera de los cambios con [(fotos)]
  readonly fotos = model<FotoGrilla[]>([]);
  readonly editable = input(false);
  readonly miniatura = input(false);
  readonly columnasFijas = input<number | null>(null);

  /** Archivos que el usuario soltó sobre la grilla. Subirlos es tarea del padre. */
  readonly archivosSoltados = output<File[]>();

  private contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');
  private observador?: ResizeObserver;

  // ---- Medidas: todo sale del ancho real del contenedor ----
  private readonly ancho = signal(0);

  readonly columnas = computed(() => this.columnasFijas() ?? columnasPara(this.ancho()));

  readonly separacion = computed(() => {
    if (this.miniatura()) return 3;
    return this.ancho() < 600 ? 6 : 10;
  });

  /** Lado de una celda en px. Las celdas son cuadradas. */
  readonly celda = computed(() => {
    const cols = this.columnas();
    return Math.max(0, (this.ancho() - this.separacion() * (cols - 1)) / cols);
  });

  /** Distancia entre el comienzo de una celda y la siguiente */
  readonly paso = computed(() => this.celda() + this.separacion());

  // ---- Estado de la interacción ----
  readonly arrastre = signal<Arrastre | null>(null);
  private readonly previa = signal<FotoGrilla[] | null>(null);
  readonly recibiendoArchivos = signal(false);
  readonly fotoAbierta = signal<FotoGrilla | null>(null);

  /** Fotos ubicadas: la vista previa mientras se arrastra, o las reales */
  readonly mostradas = computed(() => empaquetar(this.previa() ?? this.fotos(), this.columnas()));

  readonly alto = computed(() => {
    const filas = filaFinal(this.mostradas());
    const minimo = this.editable() ? 2 : 0;
    return Math.max(filas, minimo) * this.paso() - this.separacion();
  });

  /** Dónde va a caer la foto que se está moviendo (el recuadro punteado) */
  readonly destino = computed(() => {
    const a = this.arrastre();
    if (!a) return null;
    return this.mostradas().find(f => f.id === a.id) ?? null;
  });

  readonly porcentaje = porcentaje;

  ngAfterViewInit(): void {
    const el = this.contenedor().nativeElement;
    this.ancho.set(el.clientWidth);
    this.observador = new ResizeObserver(entradas => {
      this.ancho.set(entradas[0].contentRect.width);
    });
    this.observador.observe(el);
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
    this.terminarArrastre(false);
  }

  // ---------- Dibujo ----------

  src(foto: FotoGrilla): string {
    return foto.previa ?? this.lookbookService.urlImagen(foto.ruta);
  }

  transformDe(foto: Ubicada<FotoGrilla>): string {
    const a = this.arrastre();
    // La foto que se está moviendo sigue al puntero; el resto, a su celda
    if (a && a.modo === 'mover' && a.id === foto.id) {
      return `translate(${a.libreX}px, ${a.libreY}px)`;
    }
    return `translate(${foto.x * this.paso()}px, ${foto.y * this.paso()}px)`;
  }

  anchoDe(foto: Ubicada<FotoGrilla>): number {
    return foto.ancho * this.paso() - this.separacion();
  }

  altoDe(foto: Ubicada<FotoGrilla>): number {
    return foto.h * this.paso() - this.separacion();
  }

  // ---------- Mover (cambia el orden) ----------

  iniciarMovimiento(evento: PointerEvent, foto: Ubicada<FotoGrilla>): void {
    if (!this.editable() || evento.button !== 0) return;
    evento.preventDefault();

    const rect = this.contenedor().nativeElement.getBoundingClientRect();
    const izquierda = foto.x * this.paso();
    const arriba = foto.y * this.paso();

    this.empezar({
      id: foto.id,
      modo: 'mover',
      origen: foto,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      agarreX: evento.clientX - rect.left - izquierda,
      agarreY: evento.clientY - rect.top - arriba,
      libreX: izquierda,
      libreY: arriba,
      ultimoObjetivo: null
    });
  }

  // ---------- Cambiar tamaño desde la esquina ----------

  iniciarRedimension(evento: PointerEvent, foto: Ubicada<FotoGrilla>): void {
    if (!this.editable() || evento.button !== 0) return;
    evento.preventDefault();
    evento.stopPropagation(); // que no arranque también el "mover" de la foto

    this.empezar({
      id: foto.id,
      modo: 'redimensionar',
      origen: foto,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      agarreX: 0,
      agarreY: 0,
      libreX: 0,
      libreY: 0,
      ultimoObjetivo: null
    });
  }

  private empezar(arrastre: Arrastre): void {
    this.arrastre.set(arrastre);
    this.previa.set(this.fotos());
    // Se escucha en window y no en la foto: si el puntero sale de la foto
    // (pasa rápido, o sale de la grilla) el arrastre no se corta.
    window.addEventListener('pointermove', this.alMover);
    window.addEventListener('pointerup', this.alSoltar);
    window.addEventListener('pointercancel', this.alCancelar);
  }

  // Funciones flecha: así conservan el "this" al usarse como listeners
  private alMover = (evento: PointerEvent): void => {
    const a = this.arrastre();
    const lista = this.previa();
    if (!a || !lista) return;

    const paso = this.paso();
    const rect = this.contenedor().nativeElement.getBoundingClientRect();

    if (a.modo === 'mover') {
      const libreX = evento.clientX - rect.left - a.agarreX;
      const libreY = evento.clientY - rect.top - a.agarreY;

      // Celda bajo el puntero
      const celda = {
        x: Math.floor((evento.clientX - rect.left) / paso),
        y: Math.floor((evento.clientY - rect.top) / paso)
      };
      const ubicadas = this.mostradas();
      const actual = ubicadas.findIndex(u => u.id === a.id);
      const destino = indiceDestino(ubicadas, a.id, celda);
      const objetivo = ubicadas[destino]?.id ?? null;

      // Si la foto de abajo es más grande, al empujarla puede seguir quedando
      // bajo el puntero: sin este control las dos se intercambiarían sin parar.
      if (destino !== actual && objetivo !== a.ultimoObjetivo) {
        this.previa.set(moverEnLista(lista, actual, destino));
        this.arrastre.set({ ...a, libreX, libreY, ultimoObjetivo: objetivo });
      } else {
        this.arrastre.set({ ...a, libreX, libreY, ultimoObjetivo: destino === actual ? null : a.ultimoObjetivo });
      }
    } else {
      const cols = this.columnas();
      const anchoInicial = a.origen.ancho;
      const nuevoAncho = this.limitar(anchoInicial + Math.round((evento.clientX - a.inicioX) / paso), 1, Math.min(cols, ANCHO_MAXIMO));
      const h = this.limitar(a.origen.h + Math.round((evento.clientY - a.inicioY) / paso), 1, ALTO_MAXIMO);
      // Si el ancho no cambió, se conserva el elegido: una foto de 100% vista en
      // un celular ocupa 2 columnas, y agrandarle solo el alto no debe bajarla a 50%
      const w = nuevoAncho === anchoInicial ? a.origen.w : nuevoAncho;

      this.previa.set(lista.map(f => (f.id === a.id ? { ...f, w, h } : f)));
    }

    // Si el puntero llega al borde de la pantalla, la página se desplaza sola
    const margen = 70;
    if (evento.clientY > window.innerHeight - margen) window.scrollBy(0, 14);
    else if (evento.clientY < margen) window.scrollBy(0, -14);
  };

  private alSoltar = (): void => this.terminarArrastre(true);
  private alCancelar = (): void => this.terminarArrastre(false);

  private terminarArrastre(confirmar: boolean): void {
    window.removeEventListener('pointermove', this.alMover);
    window.removeEventListener('pointerup', this.alSoltar);
    window.removeEventListener('pointercancel', this.alCancelar);

    const resultado = this.previa();
    if (confirmar && resultado && this.arrastre()) {
      this.fotos.set(resultado);
    }
    this.arrastre.set(null);
    this.previa.set(null);
  }

  private limitar(valor: number, min: number, max: number): number {
    return Math.min(Math.max(valor, min), Math.max(min, max));
  }

  /** Muestra el porcentaje de la foto que se está agrandando */
  redimensionando(foto: FotoGrilla): boolean {
    const a = this.arrastre();
    return !!a && a.modo === 'redimensionar' && a.id === foto.id;
  }

  // ---------- Quitar ----------

  quitar(id: string): void {
    const foto = this.fotos().find(f => f.id === id);
    if (foto?.previa) URL.revokeObjectURL(foto.previa);
    this.fotos.set(this.fotos().filter(f => f.id !== id));
  }

  // ---------- Soltar archivos desde la compu ----------

  alPasarArchivos(evento: DragEvent): void {
    if (!this.editable() || !evento.dataTransfer?.types.includes('Files')) return;
    evento.preventDefault(); // sin esto el navegador abre la imagen en vez de soltarla acá
    evento.dataTransfer.dropEffect = 'copy';
    this.recibiendoArchivos.set(true);
  }

  alSalirArchivos(evento: DragEvent): void {
    // dragleave también se dispara al pasar sobre una foto hija: solo se apaga
    // si el puntero salió de verdad de la grilla
    const destino = evento.relatedTarget as Node | null;
    if (!destino || !this.contenedor().nativeElement.contains(destino)) {
      this.recibiendoArchivos.set(false);
    }
  }

  alSoltarArchivos(evento: DragEvent): void {
    if (!this.editable()) return;
    evento.preventDefault();
    this.recibiendoArchivos.set(false);
    const archivos = Array.from(evento.dataTransfer?.files ?? []);
    if (archivos.length) this.archivosSoltados.emit(archivos);
  }

  // ---------- Ver la foto completa (modo lectura) ----------

  abrir(foto: FotoGrilla): void {
    if (this.editable() || this.miniatura()) return;
    this.fotoAbierta.set(foto);
  }

  cerrar(): void {
    this.fotoAbierta.set(null);
  }

  navegar(direccion: 1 | -1, evento?: Event): void {
    evento?.stopPropagation();
    const lista = this.fotos(); // el orden del álbum es el orden de lectura
    const actual = this.fotoAbierta();
    if (!actual || lista.length < 2) return;
    const indice = lista.findIndex(f => f.id === actual.id);
    this.fotoAbierta.set(lista[(indice + direccion + lista.length) % lista.length]);
  }

  @HostListener('document:keydown', ['$event'])
  alTeclear(evento: KeyboardEvent): void {
    if (!this.fotoAbierta()) return;
    if (evento.key === 'Escape') this.cerrar();
    if (evento.key === 'ArrowRight') this.navegar(1);
    if (evento.key === 'ArrowLeft') this.navegar(-1);
  }
}
