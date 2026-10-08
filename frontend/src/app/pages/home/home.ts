import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProductoService, Producto } from '../../services/producto.service';
import { ProductCarouselComponent } from '../../shared/product-carousel/product-carousel';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCarouselComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class HomeComponent implements OnInit {
  sales: Producto[] = [];
  zapatos: Producto[] = [];
  piezasUnicas: Producto[] = [];

  constructor(
    private productoService: ProductoService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.productoService.getProductos().subscribe({
      next: (productos) => {
        const zapatosSueltos = productos.filter(p => p.categoria === 'zapatos');
        const piezasSueltas = productos.filter(p => p.categoria === 'sacos' || p.categoria === 'camisas');

        // Fuera de Sale, las variantes de color de un mismo modelo se agrupan
        // en una sola tarjeta (ver ProductoService.agruparPorModelo).
        this.zapatos = this.productoService.agruparPorModelo(zapatosSueltos);
        this.piezasUnicas = this.productoService.agruparPorModelo(piezasSueltas);

        // Sale es la excepción: el descuento es por variante puntual, así que
        // se muestran sueltas, sin agrupar, y solo las que tienen descuento cargado.
        this.sales = productos.filter(p => !!p.descuento && String(p.descuento).trim() !== '');

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar el catálogo de productos', err);
      }
    });
  }

  getImagenUrl(producto: Producto): string {
    const detalleRuta = producto.detalle ? `/${producto.detalle}` : '';
    return `assets/images/productos/${producto.categoria}/${producto.modelo}${detalleRuta}/${producto.imagen_portada}`;
  }
}