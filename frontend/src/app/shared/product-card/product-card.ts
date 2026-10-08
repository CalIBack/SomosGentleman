import { Component, Input, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss'
})
export class ProductCardComponent {
  @Input() producto: any;

  @HostBinding('class.is-compact') @Input() compacta = false;

  getImagenUrl(): string {
    if (!this.producto) return '';
    const detalleRuta = this.producto.detalle ? `/${this.producto.detalle}` : '';
    return `assets/images/productos/${this.producto.categoria}/${this.producto.modelo}${detalleRuta}/${this.producto.imagen_portada}`;
  }

  // Es un grupo con más de una variante de color (Chelsea, Oxford, etc.)
  get esGrupo(): boolean {
    return (this.producto?._variantesCount || 1) > 1;
  }

  get tieneDescuento(): boolean {
    return !!(this.producto?.descuento && String(this.producto.descuento).trim() !== '');
  }

  // En grupo, el descuento a mostrar es el de la variante más barata, no el
  // del propio producto representante (que puede no tener descuento).
  get mostrarDescuento(): boolean {
    return this.esGrupo ? !!this.producto?._tieneDescuentoDesde : this.tieneDescuento;
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

  get precioMostrado(): number {
    if (this.esGrupo) return this.producto?._precioDesde ?? (Number(this.producto?.precio) || 0);
    return this.precioFinal;
  }

  get precioOriginalMostrado(): number {
    if (this.esGrupo) return this.producto?._precioDesdeOriginal ?? (Number(this.producto?.precio) || 0);
    return Number(this.producto?.precio) || 0;
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
}