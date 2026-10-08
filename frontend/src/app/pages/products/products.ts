import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ProductoService } from '../../services/producto.service';
import { ProductCardComponent } from '../../shared/product-card/product-card';

export interface StockItem {
  id?: number;
  producto_id?: number;
  talle: string;
  stock: number;
}

export interface Producto {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  descuento?: string | null;
  categoria: string;
  subcategoria: string;
  modelo: string;
  detalle: string;
  imagen_portada: string;
  imagenes?: string[];
  variaciones_stock?: StockItem[];
}

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule, ProductCardComponent],
  templateUrl: './products.html',
  styleUrl: './products.scss'
})
export class ProductsComponent implements OnInit {
  productos: Producto[] = [];

  searchTerm: string = '';
  categoriaActiva: string = 'TODOS';
  subcategoriaActiva: string = 'TODAS';
  isCategoryMenuOpen: boolean = false;

  categorias: string[] = ['TODOS', 'ZAPATOS', 'SACOS', 'CAMISAS', 'SALE'];

  constructor(
    private productoService: ProductoService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Filtros que llegan por URL, ej: /productos?categoria=CAMISAS
    // Permite enlazar desde el home o el footer directo a una categoría.
    this.route.queryParamMap.subscribe(params => {
      const cat = params.get('categoria');
      const subcat = params.get('subcategoria');
      const buscar = params.get('buscar');

      this.categoriaActiva = cat ? cat.toUpperCase() : 'TODOS';
      this.subcategoriaActiva = subcat ? subcat.toUpperCase() : 'TODAS';
      this.searchTerm = buscar || '';
      this.cdr.detectChanges();
    });

    this.productoService.getProductos().subscribe({
      next: (productos) => {
        this.productos = productos;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar el catálogo de productos', err);
      }
    });
  }

  // Subcategorías dinámicas extraídas según la categoría seleccionada.
  // Si ningún producto de esta categoría tiene subcategoría real (ej: Sacos, Camisas),
  // no hay nada que mostrar y la barra de subcategorías queda oculta.
  get subcategoriasDisponibles(): string[] {
    if (this.categoriaActiva === 'TODOS' || this.categoriaActiva === 'SALE') {
      return [];
    }
    const subcats = this.productos
      .filter(p => p.categoria.toUpperCase() === this.categoriaActiva)
      .map(p => p.subcategoria?.toUpperCase())
      .filter((s): s is string => !!s && s.trim() !== '');

    return subcats.length > 0 ? ['TODAS', ...new Set(subcats)] : [];
  }

  toggleCategoryMenu(): void {
    this.isCategoryMenuOpen = !this.isCategoryMenuOpen;
  }

  seleccionarCategoria(cat: string): void {
    this.categoriaActiva = cat;
    this.subcategoriaActiva = 'TODAS';
  }

  seleccionarSubcategoria(subcat: string): void {
    this.subcategoriaActiva = subcat;
  }

  // Verifica si el producto tiene al menos una unidad en inventario
  tieneStock(producto: Producto): boolean {
    if (!producto.variaciones_stock || producto.variaciones_stock.length === 0) return true;
    return producto.variaciones_stock.reduce((acc, item) => acc + item.stock, 0) > 0;
  }

  // Filtro principal de la lista
  get productosFiltrados(): Producto[] {
    return this.productos.filter(p => {
      // 1. Filtrar productos sin stock
      if (!this.tieneStock(p)) return false;

      // 2. Coincidencia por término de búsqueda (nombre, subcategoría o modelo)
      const busqueda = this.searchTerm.toLowerCase();
      const coincideBusqueda = 
        p.nombre.toLowerCase().includes(busqueda) ||
        p.subcategoria.toLowerCase().includes(busqueda) ||
        p.modelo.toLowerCase().includes(busqueda);

      if (!coincideBusqueda) return false;

      // 3. Filtro de Categoría / SALE
      if (this.categoriaActiva === 'SALE') {
        if (!p.descuento) return false;
      } else if (this.categoriaActiva !== 'TODOS') {
        if (p.categoria.toUpperCase() !== this.categoriaActiva) return false;
      }

      // 4. Filtro de Subcategoría
      if (this.subcategoriaActiva !== 'TODAS') {
        if (p.subcategoria.toUpperCase() !== this.subcategoriaActiva) return false;
      }

      return true;
    });
  }
}