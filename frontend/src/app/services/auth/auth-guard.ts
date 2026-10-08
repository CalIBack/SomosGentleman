import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth';

/**
 * Deja pasar solo a usuarios con sesión iniciada.
 *
 * Es una comodidad de navegación, no una medida de seguridad: quien manipule el
 * frontend puede saltearlo, pero no le sirve de nada porque cada endpoint del
 * backend vuelve a verificar el token y el rol antes de responder.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.estaLogueado()) return true;

  // Guardamos a dónde quería entrar para devolverlo ahí tras iniciar sesión
  return router.createUrlTree(['/login'], {
    queryParams: { volverA: state.url }
  });
};

/** Igual que el anterior, pero además exige rol de administrador. */
export const adminGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.esAdmin()) return true;

  if (!auth.estaLogueado()) {
    return router.createUrlTree(['/login'], {
      queryParams: { volverA: state.url }
    });
  }

  // Logueado pero sin permisos: lo mandamos al inicio en vez de al login,
  // porque volver a iniciar sesión no le va a dar acceso.
  return router.createUrlTree(['/']);
};