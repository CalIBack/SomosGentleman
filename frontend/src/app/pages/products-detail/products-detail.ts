import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProductoService, Producto } from '../../services/producto.service';

interface VarianteStock {
  id: number;
  producto_id?: number;
  talle: string;
  stock: number;
}

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './products-detail.html',
  styleUrl: './products-detail.scss'
})
export class ProductsDetailComponent implements OnInit {
  producto: any = null;
  cargando = true;
  error = '';

  // Galería
  indiceActivo = 0;

  // Variantes de color (misma categoria + modelo, distinto detalle)
  variantesColor: Producto[] = [];

  // Compra
  varianteSeleccionada: VarianteStock | null = null;
  cantidad = 1;
  mensajeCarro = '';

  // Reseñas
  resenas: any[] = [];
  nuevaCalificacion = 0;
  calificacionHover = 0;
  nuevoComentario = '';
  archivoResena: File | null = null;
  nombreArchivo = '';
  enviandoResena = false;
  mensajeResena = '';
  errorResena = '';

  readonly estrellas = [1, 2, 3, 4, 5];

  constructor(
    private route: ActivatedRoute,
    private productoService: ProductoService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // paramMap como observable: si se navega de una variante a otra (cambio de
    // color) sin salir de la ruta, Angular reutiliza el componente y hay que
    // recargar los datos a mano.
    this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id'));
      if (!id || isNaN(id)) {
        this.error = 'Producto no encontrado.';
        this.cargando = false;
        return;
      }
      this.cargarProducto(id);
      this.cargarResenas(id);
    });
  }

  private cargarProducto(id: number): void {
    this.cargando = true;
    this.error = '';
    this.resetSeleccion();

    this.productoService.getProducto(id).subscribe({
      next: (producto) => {
        this.producto = producto;
        this.cargando = false;
        const disponible = this.talles.find(v => v.stock > 0);
        if (disponible) this.varianteSeleccionada = disponible;
        this.cargarVariantesColor();
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'No pudimos cargar este producto.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // Hermanos de color: mismo categoria + modelo, cualquier detalle. Si el
  // producto es único en su familia, esta lista queda con un solo elemento
  // y el selector de color no se muestra.
  private cargarVariantesColor(): void {
    this.productoService.getProductos().subscribe({
      next: (todos) => {
        this.variantesColor = todos
          .filter(p => p.categoria === this.producto.categoria && p.modelo === this.producto.modelo)
          .sort((a, b) => a.id - b.id);
        this.cdr.detectChanges();
      },
      error: () => {
        this.variantesColor = [];
      }
    });
  }

  private cargarResenas(id: number): void {
    this.productoService.getResenas(id).subscribe({
      next: (resenas) => {
        this.resenas = resenas || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.resenas = [];
        this.cdr.detectChanges();
      }
    });
  }

  private resetSeleccion(): void {
    this.indiceActivo = 0;
    this.varianteSeleccionada = null;
    this.cantidad = 1;
    this.mensajeCarro = '';
    this.variantesColor = [];
  }

  // ---------- GALERÍA ----------

  get imagenes(): string[] {
    if (!this.producto) return [];
    const lista = Array.isArray(this.producto.imagenes) ? this.producto.imagenes : [];
    return lista.length > 0 ? lista : [this.producto.imagen_portada];
  }

  get carpetaBase(): string {
    if (!this.producto) return '';
    const detalleRuta = this.producto.detalle ? `/${this.producto.detalle}` : '';
    return `assets/images/productos/${this.producto.categoria}/${this.producto.modelo}${detalleRuta}`;
  }

  urlImagen(nombre: string): string {
    return `${this.carpetaBase}/${nombre}`;
  }

  get imagenActiva(): string {
    const img = this.imagenes[this.indiceActivo];
    return img ? this.urlImagen(img) : '';
  }

  seleccionarImagen(i: number): void {
    this.indiceActivo = i;
  }

  // ---------- COLOR ----------

  get mostrarSelectorColor(): boolean {
    return this.variantesColor.length > 1;
  }

  urlSwatch(variante: Producto): string {
    const detalleRuta = variante.detalle ? `/${variante.detalle}` : '';
    return `assets/images/productos/${variante.categoria}/${variante.modelo}${detalleRuta}/${variante.imagen_portada}`;
  }

  // ---------- PRECIO ----------

  get tieneDescuento(): boolean {
    return !!(this.producto?.descuento && String(this.producto.descuento).trim() !== '');
  }

  get precioFinal(): number {
    const precio = Number(this.producto?.precio) || 0;
    if (!this.tieneDescuento) return precio;

    const texto = String(this.producto.descuento).trim();

    if (texto.endsWith('%')) {
      const porcentaje = parseFloat(texto.replace('%', ''));
      if (isNaN(porcentaje)) return precio;
      return Math.max(0, precio - (precio * Math.abs(porcentaje) / 100));
    }

    const monto = parseFloat(texto);
    if (isNaN(monto)) return precio;
    return Math.max(0, precio - Math.abs(monto));
  }

  get textoDescuento(): string {
    if (!this.tieneDescuento) return '';
    const texto = String(this.producto.descuento).trim();

    if (texto.endsWith('%')) {
      const porcentaje = parseFloat(texto.replace('%', ''));
      return isNaN(porcentaje) ? texto : `-${Math.abs(porcentaje)}%`;
    }

    const monto = parseFloat(texto);
    return isNaN(monto) ? texto : `-$${Math.abs(monto).toLocaleString('es-AR')}`;
  }

  // ---------- STOCK / TALLES ----------

  get talles(): VarianteStock[] {
    return this.producto?.variaciones_stock || [];
  }

  get mostrarSelectorTalle(): boolean {
    return this.talles.length > 1 ||
           (this.talles.length === 1 && this.talles[0].talle?.toLowerCase() !== 'único');
  }

  get stockTotal(): number {
    return this.talles.reduce((acc, v) => acc + Number(v.stock), 0);
  }

  get hayStock(): boolean {
    return this.stockTotal > 0;
  }

  get stockSeleccionado(): number {
    if (this.varianteSeleccionada) return Number(this.varianteSeleccionada.stock);
    return this.talles.length === 1 ? Number(this.talles[0].stock) : 0;
  }

  get puedeComprar(): boolean {
    return this.hayStock && this.stockSeleccionado > 0 && this.cantidad <= this.stockSeleccionado;
  }

  seleccionarTalle(variante: VarianteStock): void {
    if (variante.stock < 1) return;
    this.varianteSeleccionada = variante;
    this.cantidad = 1;
    this.mensajeCarro = '';
  }

  cambiarCantidad(delta: number): void {
    const nueva = this.cantidad + delta;
    if (nueva < 1) return;
    if (this.stockSeleccionado > 0 && nueva > this.stockSeleccionado) return;
    this.cantidad = nueva;
  }

  agregarAlCarro(): void {
    if (!this.puedeComprar) return;
    const variante = this.varianteSeleccionada || this.talles[0];
    const talle = variante?.talle ? ` (talle ${variante.talle})` : '';
    this.mensajeCarro = `Agregado: ${this.cantidad} × ${this.producto.nombre}${talle}.`;
  }

  // ---------- RESEÑAS ----------

  get promedioCalificacion(): number {
    if (!this.resenas.length) return 0;
    const suma = this.resenas.reduce((acc, r) => acc + Number(r.calificacion), 0);
    return suma / this.resenas.length;
  }

  get promedioRedondeado(): number {
    return Math.round(this.promedioCalificacion);
  }

  setCalificacion(valor: number): void {
    this.nuevaCalificacion = valor;
  }

  onArchivoSeleccionado(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0] || null;
    this.archivoResena = archivo;
    this.nombreArchivo = archivo ? archivo.name : '';
  }

  quitarArchivo(): void {
    this.archivoResena = null;
    this.nombreArchivo = '';
  }

  enviarResena(): void {
    this.mensajeResena = '';
    this.errorResena = '';

    if (this.nuevaCalificacion < 1) {
      this.errorResena = 'Elegí una calificación de 1 a 5 estrellas.';
      return;
    }

    this.enviandoResena = true;

    if (this.archivoResena) {
      this.productoService.subirImagen(this.archivoResena).subscribe({
        next: (res) => this.guardarResena(res?.ruta || null),
        error: () => this.fallarResena('No pudimos subir la imagen. Probá con otra.')
      });
    } else {
      this.guardarResena(null);
    }
  }

  private guardarResena(rutaImagen: string | null): void {
    const datos: any = {
      producto_id: this.producto.id,
      calificacion: this.nuevaCalificacion,
      comentario: this.nuevoComentario?.trim() || ''
    };
    if (rutaImagen) datos.imagen_opcional = rutaImagen;

    this.productoService.crearResena(datos).subscribe({
      next: () => {
        this.enviandoResena = false;
        this.mensajeResena = 'Gracias por tu reseña.';
        this.nuevaCalificacion = 0;
        this.nuevoComentario = '';
        this.quitarArchivo();
        this.cargarResenas(this.producto.id);
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err?.status === 401
          ? 'Iniciá sesión para dejar tu reseña.'
          : 'No pudimos publicar tu reseña. Intentá de nuevo.';
        this.fallarResena(msg);
      }
    });
  }

  private fallarResena(mensaje: string): void {
    this.enviandoResena = false;
    this.errorResena = mensaje;
    this.cdr.detectChanges();
  }
}