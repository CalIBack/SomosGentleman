import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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
  variante_destacada?: boolean;
  imagen_portada: string;
  imagenes?: string[];
  variaciones_stock?: StockItem[];
  // Campos derivados en el cliente (no vienen del backend), solo para la
  // tarjeta de un grupo con más de una variante de color:
  _variantesCount?: number;
  _precioDesde?: number;
  _precioDesdeOriginal?: number;
  _tieneDescuentoDesde?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ProductoService {
  private baseUrl = 'http://localhost/SomosGentleman/backend';
  private apiUrl = `${this.baseUrl}/productos`;

  constructor(private http: HttpClient) {}

  getProductos(): Observable<Producto[]> {
    return this.http.get<Producto[]>(this.apiUrl);
  }

  getProducto(id: number): Observable<Producto> {
    return this.http.get<Producto>(`${this.apiUrl}/${id}`);
  }

  getResenas(productoId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/resenas?producto_id=${productoId}`);
  }

  crearResena(datos: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/resenas`, datos);
  }

  subirImagen(archivo: File): Observable<any> {
    const formData = new FormData();
    formData.append('imagen', archivo);
    return this.http.post<any>(`${this.baseUrl}/upload`, formData);
  }

  /**
   * Agrupa productos que comparten categoría + modelo (mismas piezas en distintos
   * colores) en un solo producto representante. El representante es el marcado
   * como 'variante_destacada' por el admin; si ninguno lo está, se usa el de
   * menor id como red de seguridad. Se usa fuera de Sale: ahí cada variante con
   * descuento se muestra suelta.
   */
  agruparPorModelo(productos: Producto[]): Producto[] {
    const grupos = new Map<string, Producto[]>();

    for (const p of productos) {
      const clave = `${p.categoria}|${p.modelo}`.toLowerCase();
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave)!.push(p);
    }

    return Array.from(grupos.values()).map(variantes => {
      const ordenadas = [...variantes].sort((a, b) => a.id - b.id);
      const destacada = ordenadas.find(p => p.variante_destacada);
      const representante: Producto = { ...(destacada || ordenadas[0]) };
      representante._variantesCount = ordenadas.length;

      if (ordenadas.length > 1) {
        // El nombre de portada del grupo no lleva color: "Botineta Chelsea",
        // no "Botinetas Chelsea Suela". El nombre completo con color sigue
        // existiendo (viene del backend) y se ve al entrar al detalle.
        const titulo = [representante.subcategoria, representante.modelo]
          .filter(s => !!s && s.trim() !== '')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        if (titulo) representante.nombre = titulo;

        // Precio "Desde": la variante más barata del grupo, ya con su
        // descuento aplicado si lo tiene.
        const precios = ordenadas.map(p => this.precioFinalDe(p));
        const precioMinimo = Math.min(...precios);
        const variantePrecioMinimo = ordenadas[precios.indexOf(precioMinimo)];

        representante._precioDesde = precioMinimo;
        representante._precioDesdeOriginal = Number(variantePrecioMinimo.precio);
        representante._tieneDescuentoDesde = !!variantePrecioMinimo.descuento;
      }

      return representante;
    });
  }

  private precioFinalDe(p: Producto): number {
    const precio = Number(p.precio) || 0;
    if (!p.descuento) return precio;

    const texto = String(p.descuento).trim();
    if (texto.endsWith('%')) {
      const pct = parseFloat(texto.replace('%', ''));
      return isNaN(pct) ? precio : Math.max(0, precio - (precio * Math.abs(pct) / 100));
    }
    const monto = parseFloat(texto);
    return isNaN(monto) ? precio : Math.max(0, precio - Math.abs(monto));
  }
}