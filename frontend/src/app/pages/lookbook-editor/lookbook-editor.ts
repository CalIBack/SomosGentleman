import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import {
  Compartido, LookbookGuardar, LookbookService, UsuarioDirectorio
} from '../../services/lookbook';
import { FotoGrilla, LookbookGridComponent } from '../../shared/lookbook-grid/lookbook-grid';
import { tamanioInicial } from '../../shared/lookbook-grid/lookbook-layout';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANIO_MAXIMO = 15 * 1024 * 1024; // igual que el backend
const MAX_FOTOS = 40;                     // igual que el backend

/**
 * Cómo previsualizar el álbum mientras se edita. Cada opción fija las columnas
 * que tendría ese aparato, así el usuario ve lo mismo que verá quien lo abra.
 */
type Dispositivo = 'compu' | 'tablet' | 'celular';

@Component({
  selector: 'app-lookbook-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, LookbookGridComponent],
  templateUrl: './lookbook-editor.html',
  styleUrl: './lookbook-editor.scss'
})
export class LookbookEditorComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private lookbookService = inject(LookbookService);

  readonly dispositivos: { valor: Dispositivo; etiqueta: string; columnas: number }[] = [
    { valor: 'compu', etiqueta: 'Compu', columnas: 4 },
    { valor: 'tablet', etiqueta: 'Tablet', columnas: 3 },
    { valor: 'celular', etiqueta: 'Celular', columnas: 2 }
  ];
  readonly maxFotos = MAX_FOTOS;

  // Todo el estado son signals: el proyecto es zoneless y así la vista se
  // actualiza sola cuando responde el backend, sin detectChanges().
  readonly id = signal<number | null>(null);
  readonly titulo = signal('');
  // Arranca mostrando el aparato desde el que se está editando
  readonly dispositivo = signal<Dispositivo>(
    window.innerWidth >= 900 ? 'compu' : window.innerWidth >= 600 ? 'tablet' : 'celular'
  );
  readonly columnasVista = computed(() =>
    this.dispositivos.find(d => d.valor === this.dispositivo())!.columnas
  );
  readonly publico = signal(false);
  readonly notas = signal('');
  readonly fotos = signal<FotoGrilla[]>([]);

  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal('');
  readonly aviso = signal('');

  readonly subiendo = computed(() => this.fotos().filter(f => f.subiendo).length);

  /** Lo que se mandaría al backend si se guardara ahora */
  private readonly datos = computed<LookbookGuardar>(() => ({
    titulo: this.titulo().trim(),
    publico: this.publico(),
    notas_medidas: this.notas().trim(),
    composicion: this.fotos()
      .filter(f => f.ruta)
      .map(({ ruta, w, h }) => ({ ruta, w, h }))
  }));

  // Foto de lo último guardado, para avisar si hay cambios pendientes
  private readonly ultimoGuardado = signal('');
  readonly hayCambios = computed(() => JSON.stringify(this.datos()) !== this.ultimoGuardado());

  readonly puedeGuardar = computed(() =>
    !this.guardando() &&
    this.subiendo() === 0 &&
    this.titulo().trim().length > 0 &&
    this.datos().composicion.length > 0
  );

  // ---- Compartir ----
  readonly busqueda = signal('');
  readonly resultados = signal<UsuarioDirectorio[]>([]);
  readonly compartidos = signal<Compartido[]>([]);
  private busqueda$ = new Subject<string>();
  private suscripciones = new Subscription();

  /** Resultados de búsqueda sin las personas que ya lo tienen */
  readonly resultadosFiltrados = computed(() => {
    const yaCompartidos = new Set(this.compartidos().map(c => c.usuario_receptor_id));
    return this.resultados().filter(u => !yaCompartidos.has(u.id));
  });

  private contadorIds = 0;

  ngOnInit(): void {
    // Aviso que deja el guardado de un lookbook nuevo al redirigir a su URL de edición
    const avisoPrevio = history.state?.aviso;
    if (avisoPrevio) this.aviso.set(avisoPrevio);

    this.suscripciones.add(
      this.route.paramMap.subscribe(params => {
        const id = Number(params.get('id'));
        if (id > 0) {
          this.id.set(id);
          this.cargar(id);
        } else {
          this.ultimoGuardado.set(JSON.stringify(this.datos()));
        }
      })
    );

    // Búsqueda de usuarios: espera a que se deje de tipear y cancela la anterior
    this.suscripciones.add(
      this.busqueda$.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(texto => texto.trim().length < 2
          ? of([])
          : this.lookbookService.buscarUsuarios(texto.trim()).pipe(catchError(() => of([]))))
      ).subscribe(usuarios => this.resultados.set(usuarios))
    );
  }

  ngOnDestroy(): void {
    this.suscripciones.unsubscribe();
    // Las vistas previas locales ocupan memoria: se liberan al salir
    this.fotos().forEach(f => f.previa && URL.revokeObjectURL(f.previa));
  }

  private cargar(id: number): void {
    this.cargando.set(true);
    this.lookbookService.obtener(id).subscribe({
      next: lookbook => {
        // Solo el dueño o un admin editan. El backend igual lo vuelve a verificar al guardar.
        if (lookbook.acceso !== 'duenio' && lookbook.acceso !== 'admin') {
          this.router.navigate(['/lookbooks', id]);
          return;
        }
        this.titulo.set(lookbook.titulo);
        this.publico.set(lookbook.publico);
        this.notas.set(lookbook.notas_medidas ?? '');
        this.fotos.set(lookbook.composicion.map(f => ({ ...f, id: this.nuevoId() })));
        this.ultimoGuardado.set(JSON.stringify(this.datos()));
        this.cargando.set(false);
        this.cargarCompartidos();
      },
      error: () => {
        this.cargando.set(false);
        this.error.set('No encontramos ese lookbook.');
      }
    });
  }

  private nuevoId(): string {
    return `f${Date.now()}-${this.contadorIds++}`;
  }

  // ---------- Grilla ----------

  alElegirArchivos(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.agregarArchivos(Array.from(input.files ?? []));
    input.value = ''; // permite volver a elegir el mismo archivo
  }

  async agregarArchivos(archivos: File[]): Promise<void> {
    this.error.set('');
    const lugar = MAX_FOTOS - this.fotos().length;
    if (lugar <= 0) {
      this.error.set(`Un lookbook admite hasta ${MAX_FOTOS} fotos.`);
      return;
    }
    if (archivos.length > lugar) {
      this.error.set(`Solo se agregaron ${lugar} fotos: el máximo es ${MAX_FOTOS}.`);
    }

    // De a una y en orden: cada foto se agrega al final del álbum con un tamaño
    // según su forma, y la grilla la ubica en el primer hueco donde entre
    for (const archivo of archivos.slice(0, lugar)) {
      if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
        this.error.set(`"${archivo.name}" no es una imagen JPG, PNG o WEBP.`);
        continue;
      }
      if (archivo.size > TAMANIO_MAXIMO) {
        this.error.set(`"${archivo.name}" pesa más de 15 MB.`);
        continue;
      }

      const previa = URL.createObjectURL(archivo);
      const { ancho, alto } = await this.medir(previa);
      const { w, h } = tamanioInicial(ancho, alto);
      const id = this.nuevoId();

      this.fotos.update(lista => [...lista, { id, ruta: '', previa, subiendo: true, w, h }]);
      this.subir(id, archivo, previa);
    }
  }

  private subir(id: string, archivo: File, previa: string): void {
    this.lookbookService.subirImagen(archivo).subscribe({
      next: respuesta => {
        // Se conserva la vista previa local para que la foto no parpadee
        this.fotos.update(lista => lista.map(f =>
          f.id === id ? { ...f, ruta: respuesta.ruta, subiendo: false } : f
        ));
      },
      error: err => {
        URL.revokeObjectURL(previa);
        this.fotos.update(lista => lista.filter(f => f.id !== id));
        this.error.set(err?.error?.message || `No se pudo subir "${archivo.name}".`);
      }
    });
  }

  /** Lee el ancho y alto reales de la imagen (el navegador ya aplica la rotación del celular) */
  private medir(url: string): Promise<{ ancho: number; alto: number }> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ ancho: img.naturalWidth, alto: img.naturalHeight });
      img.onerror = () => resolve({ ancho: 0, alto: 0 });
      img.src = url;
    });
  }

  // ---------- Guardar / eliminar ----------

  guardar(): void {
    if (!this.puedeGuardar()) return;
    this.error.set('');
    this.aviso.set('');
    this.guardando.set(true);

    const datos = this.datos();
    const id = this.id();
    const pedido = id ? this.lookbookService.actualizar(id, datos) : this.lookbookService.crear(datos);

    pedido.subscribe({
      next: respuesta => {
        this.guardando.set(false);
        this.ultimoGuardado.set(JSON.stringify(datos));
        if (!id) {
          // Recién creado: pasa a su URL de edición, donde ya se puede compartir
          this.router.navigate(['/lookbooks', respuesta.id, 'editar'], {
            replaceUrl: true,
            state: { aviso: 'Lookbook creado. Ya podés compartirlo.' }
          });
        } else {
          this.aviso.set('Cambios guardados.');
        }
      },
      error: err => {
        this.guardando.set(false);
        this.error.set(err?.error?.message || 'No se pudo guardar. Intentá de nuevo.');
      }
    });
  }

  eliminar(): void {
    const id = this.id();
    if (!id || !confirm(`¿Eliminar "${this.titulo()}"? No se puede deshacer.`)) return;

    this.lookbookService.eliminar(id).subscribe({
      next: () => this.router.navigate(['/lookbooks'], { queryParams: { vista: 'mios' } }),
      error: err => this.error.set(err?.error?.message || 'No se pudo eliminar.')
    });
  }

  // ---------- Compartir ----------

  buscar(texto: string): void {
    this.busqueda.set(texto);
    this.busqueda$.next(texto);
  }

  private cargarCompartidos(): void {
    const id = this.id();
    if (!id) return;
    this.lookbookService.listarCompartidos(id).subscribe({
      next: lista => this.compartidos.set(lista),
      error: () => this.compartidos.set([])
    });
  }

  compartirCon(usuario: UsuarioDirectorio): void {
    const id = this.id();
    if (!id) return;
    this.error.set('');
    this.lookbookService.compartir(id, usuario.id).subscribe({
      next: () => {
        this.aviso.set(`Compartido con ${usuario.nombre_completo}.`);
        this.buscar('');
        this.resultados.set([]);
        this.cargarCompartidos();
      },
      error: err => this.error.set(err?.error?.message || 'No se pudo compartir.')
    });
  }

  dejarDeCompartir(compartido: Compartido): void {
    this.lookbookService.dejarDeCompartir(compartido.id).subscribe({
      next: () => this.compartidos.update(lista => lista.filter(c => c.id !== compartido.id)),
      error: err => this.error.set(err?.error?.message || 'No se pudo quitar.')
    });
  }

  iniciales(nombre: string): string {
    return nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }
}
