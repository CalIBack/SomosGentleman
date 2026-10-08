import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth/auth';
import { Lookbook, LookbookService, VistaLookbooks } from '../../services/lookbook';
import { FotoGrilla, LookbookGridComponent } from '../../shared/lookbook-grid/lookbook-grid';

interface Tarjeta {
  lookbook: Lookbook;
  fotos: FotoGrilla[];
}

@Component({
  selector: 'app-lookbooks',
  standalone: true,
  imports: [RouterLink, LookbookGridComponent],
  templateUrl: './lookbooks.html',
  styleUrl: './lookbooks.scss'
})
export class LookbooksComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private lookbookService = inject(LookbookService);
  readonly auth = inject(AuthService);

  readonly vista = signal<VistaLookbooks>('publicos');
  readonly tarjetas = signal<Tarjeta[]>([]);
  readonly cargando = signal(false);
  readonly error = signal('');

  private suscripcion?: Subscription;

  ngOnInit(): void {
    // La pestaña vive en la URL (?vista=mios) para que se pueda volver con "atrás"
    // y para que el menú del usuario lleve directo a "Mis lookbooks"
    this.suscripcion = this.route.queryParamMap.subscribe(params => {
      const pedida = params.get('vista');
      const vista: VistaLookbooks = pedida === 'mios' || pedida === 'compartidos' ? pedida : 'publicos';

      if (vista !== 'publicos' && !this.auth.estaLogueado()) {
        this.router.navigate(['/login'], { queryParams: { volverA: `/lookbooks?vista=${vista}` } });
        return;
      }

      this.vista.set(vista);
      this.cargar();
    });
  }

  ngOnDestroy(): void {
    this.suscripcion?.unsubscribe();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set('');
    this.tarjetas.set([]);

    this.lookbookService.listar(this.vista()).subscribe({
      next: lista => {
        // Se arma una sola vez la lista de fotos de cada tarjeta, así la
        // grilla en miniatura no se recalcula en cada ciclo de la vista
        this.tarjetas.set(lista.map(lookbook => ({
          lookbook,
          fotos: lookbook.composicion.map((f, i) => ({ ...f, id: `${lookbook.id}-${i}` }))
        })));
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.error.set('No pudimos cargar los lookbooks. Intentá de nuevo en un momento.');
      }
    });
  }

  cambiarVista(vista: VistaLookbooks): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vista: vista === 'publicos' ? null : vista }
    });
  }

  crear(): void {
    if (this.auth.estaLogueado()) {
      this.router.navigate(['/lookbooks', 'nuevo']);
    } else {
      this.router.navigate(['/login'], { queryParams: { volverA: '/lookbooks/nuevo' } });
    }
  }

  quitarDeMiLista(tarjeta: Tarjeta, evento: Event): void {
    // El botón está dentro del enlace de la tarjeta: que no navegue
    evento.preventDefault();
    evento.stopPropagation();

    const compartidoId = tarjeta.lookbook.compartido_id;
    if (!compartidoId || !confirm(`¿Quitar "${tarjeta.lookbook.titulo}" de tu lista?`)) return;

    this.lookbookService.dejarDeCompartir(compartidoId).subscribe({
      next: () => this.tarjetas.update(lista => lista.filter(t => t !== tarjeta)),
      error: () => this.error.set('No se pudo quitar el lookbook de tu lista.')
    });
  }

  mensajeVacio(): string {
    switch (this.vista()) {
      case 'mios': return 'Todavía no armaste ningún lookbook.';
      case 'compartidos': return 'Nadie te compartió un lookbook todavía.';
      default: return 'La comunidad todavía no publicó lookbooks. ¿Querés ser el primero?';
    }
  }
}
