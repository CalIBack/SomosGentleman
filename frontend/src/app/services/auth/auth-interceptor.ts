import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth';

/**
 * Agrega el JWT a cada pedido dirigido a nuestro backend.
 *
 * Con esto ningún servicio tiene que acordarse de mandar el header: pedidos,
 * lookbooks, reseñas y el panel de admin lo reciben solo.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.token;

  // Solo se adjunta a nuestra propia API. Si algún día el frontend consulta
  // otro servicio (un mapa, un CDN), el token no se le manda a un tercero.
  const esNuestraApi = req.url.startsWith(auth.baseUrl);

  const pedido = (token && esNuestraApi)
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(pedido).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 = token vencido o inválido. Cerramos sesión y mandamos al login
      // conservando a dónde quería ir, para volver ahí después de entrar.
      if (error.status === 401 && esNuestraApi && auth.estaLogueado()) {
        auth.logout();
        router.navigate(['/login'], {
          queryParams: { volverA: router.url }
        });
      }
      return throwError(() => error);
    })
  );
};