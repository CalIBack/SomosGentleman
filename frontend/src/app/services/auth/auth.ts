import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface UsuarioSesion {
  id: number;
  nombre: string;
  email: string;
  rol: 'cliente' | 'admin';
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Misma base que el resto de los servicios del proyecto
  readonly baseUrl = 'http://localhost/SomosGentleman/backend';

  private readonly CLAVE_TOKEN = 'sg_token';

  // Estado de sesión como signal: los componentes lo leen directo en el template
  // y Angular los vuelve a dibujar solo cuando cambia, sin necesidad de
  // suscripciones ni de llamar a detectChanges() a mano (el proyecto es zoneless).
  private _usuario = signal<UsuarioSesion | null>(null);

  readonly usuario = this._usuario.asReadonly();
  readonly estaLogueado = computed(() => this._usuario() !== null);
  readonly esAdmin = computed(() => this._usuario()?.rol === 'admin');

  constructor(private http: HttpClient) {
    // Al recargar la página el signal arranca vacío, pero el token sigue en
    // localStorage: lo releemos para no perder la sesión en cada F5.
    this.restaurarSesion();
  }

  get token(): string | null {
    return localStorage.getItem(this.CLAVE_TOKEN);
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/login`, { email, password }).pipe(
      tap(res => {
        if (res?.token) this.guardarSesion(res.token);
      })
    );
  }

  registrar(nombre_completo: string, email: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/usuarios`, { nombre_completo, email, password });
  }

  logout(): void {
    localStorage.removeItem(this.CLAVE_TOKEN);
    this._usuario.set(null);
  }

  private guardarSesion(token: string): void {
    localStorage.setItem(this.CLAVE_TOKEN, token);
    this._usuario.set(this.leerUsuarioDelToken(token));
  }

  private restaurarSesion(): void {
    const token = this.token;
    if (!token) return;

    const usuario = this.leerUsuarioDelToken(token);
    if (usuario) {
      this._usuario.set(usuario);
    } else {
      // Token vencido o corrupto: lo descartamos para no arrastrar una sesión falsa
      this.logout();
    }
  }

  /**
   * Decodifica el payload del JWT para saber nombre y rol del usuario.
   *
   * IMPORTANTE: esto NO valida nada, solo lee. Cualquiera puede editar el token
   * en su navegador y decir que es admin, pero eso solo cambiaría lo que ve en
   * pantalla: la firma la verifica el backend en cada request, así que un rol
   * falseado acá no da acceso a ningún dato ni acción. Se usa únicamente para
   * decidir qué mostrar en la interfaz.
   */
  private leerUsuarioDelToken(token: string): UsuarioSesion | null {
    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) return null;

      // El JWT usa base64url (- y _ en vez de + y /), hay que convertirlo
      const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(json);

      // exp viene en segundos, Date.now() en milisegundos
      if (payload.exp && payload.exp * 1000 <= Date.now()) return null;

      return {
        id: Number(payload.id),
        nombre: payload.nombre,
        email: payload.email,
        rol: payload.rol
      };
    } catch {
      return null;
    }
  }
}