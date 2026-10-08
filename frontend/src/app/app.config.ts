import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './services/auth/auth-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Por defecto Angular conserva la posición de scroll al cambiar de página:
    // si hacés clic en un enlace del pie del home, llegás a la página nueva ya
    // desplazado hacia abajo. 'enabled' lleva al tope en cada navegación nueva
    // (y restaura la posición al usar atrás/adelante), y anchorScrolling hace
    // que los enlaces con fragment (#consulta) salten a esa sección.
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled'
      })
    ),
    // El interceptor agrega el JWT a cada pedido dirigido al backend, así que
    // ningún servicio tiene que ocuparse del header Authorization por su cuenta.
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};