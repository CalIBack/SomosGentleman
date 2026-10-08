import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth/auth';

/**
 * Una foto guardada en el lookbook. No guarda posición: el orden del array es el
 * orden del álbum, y la grilla calcula dónde va cada una según la pantalla.
 *   w = ancho en cuartos del álbum (1 = 25% ... 4 = 100%)
 *   h = alto en filas
 */
export interface FotoLookbook {
  ruta: string;
  w: number;
  h: number;
}

export type AccesoLookbook = 'duenio' | 'admin' | 'compartido' | 'publico';
export type VistaLookbooks = 'publicos' | 'mios' | 'compartidos';

export interface Lookbook {
  id: number;
  usuario_creador_id: number;
  titulo: string;
  imagen_inspiracion: string | null;
  composicion: FotoLookbook[];
  notas_medidas?: string | null;   // no viene en la vista pública
  publico: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
  autor_nombre: string;
  autor_foto: string | null;
  compartido_id?: number;           // solo en la vista "compartidos conmigo"
  acceso?: AccesoLookbook;          // solo al pedir uno por id
}

export interface LookbookGuardar {
  titulo: string;
  composicion: FotoLookbook[];
  notas_medidas: string;
  publico: boolean;
}

export interface UsuarioDirectorio {
  id: number;
  nombre_completo: string;
  foto_perfil: string | null;
}

export interface Compartido {
  id: number;
  usuario_receptor_id: number;
  nombre_completo: string;
  foto_perfil: string | null;
  fecha_compartido: string;
}

export interface ImagenSubida {
  ruta: string;
  ancho: number;
  alto: number;
}

@Injectable({
  providedIn: 'root'
})
export class LookbookService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  // Se toma la base del AuthService para tener la URL del backend en un solo lugar
  private get api(): string {
    return this.auth.baseUrl;
  }

  // Las fotos subidas se guardan en /uploads, al lado de /backend:
  // http://localhost/SomosGentleman/backend -> http://localhost/SomosGentleman
  private get raizServidor(): string {
    return this.auth.baseUrl.replace(/\/backend\/?$/, '');
  }

  /**
   * Convierte una ruta guardada en una URL para el <img>.
   * - uploads/...  -> vive en el servidor PHP
   * - assets/...   -> foto del catálogo, vive en el propio Angular
   */
  urlImagen(ruta: string | null | undefined): string {
    if (!ruta) return '';
    return ruta.startsWith('uploads/') ? `${this.raizServidor}/${ruta}` : ruta;
  }

  listar(vista: VistaLookbooks): Observable<Lookbook[]> {
    const params: Record<string, string> = vista === 'publicos' ? {} : { vista };
    return this.http.get<Lookbook[]>(`${this.api}/lookbooks`, { params });
  }

  obtener(id: number): Observable<Lookbook> {
    return this.http.get<Lookbook>(`${this.api}/lookbooks/${id}`);
  }

  crear(datos: LookbookGuardar): Observable<{ id: number; mensaje: string }> {
    return this.http.post<{ id: number; mensaje: string }>(`${this.api}/lookbooks`, datos);
  }

  actualizar(id: number, datos: Partial<LookbookGuardar>): Observable<{ id: number; mensaje: string }> {
    return this.http.patch<{ id: number; mensaje: string }>(`${this.api}/lookbooks/${id}`, datos);
  }

  eliminar(id: number): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(`${this.api}/lookbooks/${id}`);
  }

  /** Sube una foto. El backend valida el tipo real, la endereza y la comprime. */
  subirImagen(archivo: File): Observable<ImagenSubida> {
    const formulario = new FormData();
    formulario.append('imagen', archivo);
    return this.http.post<ImagenSubida>(`${this.api}/upload`, formulario);
  }

  // ---------- Compartir ----------

  buscarUsuarios(texto: string): Observable<UsuarioDirectorio[]> {
    return this.http.get<UsuarioDirectorio[]>(`${this.api}/directorio`, { params: { q: texto } });
  }

  listarCompartidos(lookbookId: number): Observable<Compartido[]> {
    return this.http.get<Compartido[]>(`${this.api}/compartidos`, { params: { lookbook_id: lookbookId } });
  }

  compartir(lookbookId: number, usuarioId: number): Observable<{ id: number; mensaje: string }> {
    return this.http.post<{ id: number; mensaje: string }>(`${this.api}/compartidos`, {
      lookbook_id: lookbookId,
      usuario_receptor_id: usuarioId
    });
  }

  /** El dueño deja de compartir, o quien lo recibió lo quita de su lista */
  dejarDeCompartir(compartidoId: number): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(`${this.api}/compartidos/${compartidoId}`);
  }
}
