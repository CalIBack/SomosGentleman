import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Lookbook, LookbookService } from '../../services/lookbook';
import { FotoGrilla, LookbookGridComponent } from '../../shared/lookbook-grid/lookbook-grid';

@Component({
  selector: 'app-lookbook-detalle',
  standalone: true,
  imports: [RouterLink, LookbookGridComponent],
  templateUrl: './lookbook-detalle.html',
  styleUrl: './lookbook-detalle.scss'
})
export class LookbookDetalleComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private lookbookService = inject(LookbookService);

  readonly lookbook = signal<Lookbook | null>(null);
  readonly cargando = signal(true);
  readonly noEncontrado = signal(false);

  readonly fotos = computed<FotoGrilla[]>(() =>
    (this.lookbook()?.composicion ?? []).map((f, i) => ({ ...f, id: `f${i}` }))
  );

  readonly puedeEditar = computed(() => {
    const acceso = this.lookbook()?.acceso;
    return acceso === 'duenio' || acceso === 'admin';
  });

  /** Fecha legible, ej: "6 de octubre de 2026" */
  readonly fecha = computed(() => {
    const lb = this.lookbook();
    if (!lb) return '';
    // MySQL devuelve "2026-10-06 15:30:00": se cambia el espacio por T para que Date lo entienda
    const fecha = new Date(lb.fecha_actualizacion.replace(' ', 'T'));
    return isNaN(fecha.getTime())
      ? ''
      : fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  });

  private suscripcion?: Subscription;

  ngOnInit(): void {
    this.suscripcion = this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id'));
      this.cargar(id);
    });
  }

  ngOnDestroy(): void {
    this.suscripcion?.unsubscribe();
  }

  private cargar(id: number): void {
    this.cargando.set(true);
    this.noEncontrado.set(false);

    if (!id) {
      this.cargando.set(false);
      this.noEncontrado.set(true);
      return;
    }

    this.lookbookService.obtener(id).subscribe({
      next: lookbook => {
        this.lookbook.set(lookbook);
        this.cargando.set(false);
      },
      // El backend responde 404 tanto si no existe como si es privado y no tenés acceso
      error: () => {
        this.cargando.set(false);
        this.noEncontrado.set(true);
      }
    });
  }
}
