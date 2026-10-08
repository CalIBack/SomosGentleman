import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CitaService } from '../../services/cita';

interface CeldaDia {
  dia: number;
  fecha: string;      // 'YYYY-MM-DD'
  habilitado: boolean;
  lleno: boolean;
  esHoy: boolean;
}

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contacto.html',
  styleUrl: './contacto.scss'
})
export class ContactoComponent implements OnInit {

  // === CONTENIDO EDITABLE ===
  // Textos e imágenes de los dos bloques promocionales. Cambiar acá.
  readonly contenidoTipo: any = {
    visita: {
      titulo: 'Visitá el showroom',
      texto: 'Te recibimos en Viamonte 1866 para que veas las piezas en persona, las pruebes sin apuro y encuentres el calce exacto. Sin vendedores encima: solo vos, la prenda y el espejo.',
      puntos: ['Atención personalizada, un cliente por turno', 'Probador privado', 'Café de por medio'],
      imagenes: [
        'assets/images/pages/contacto/visita-1.png',
        'assets/images/pages/contacto/visita-2.png'
      ]
    },
    sastreria_medida: {
      titulo: 'Sastrería a medida',
      texto: 'Tomamos tus medidas, elegimos la tela juntos y construimos una pieza que no existe en ningún otro guardarropa. El proceso lleva tiempo, y esa es exactamente la idea.',
      puntos: ['Toma de medidas completa', 'Selección de telas y forrería', 'Dos pruebas de ajuste incluidas'],
      imagenes: [
        'assets/images/pages/contacto/sastreria-1.png',
        'assets/images/pages/contacto/sastreria-2.png'
      ]
    }
  };

  readonly whatsappNumero = '5491122334455';
  readonly whatsappMensaje = 'Hola! Quería hacer una consulta sobre';
  readonly emailContacto = 'contacto@somosgentleman.com';

  // === CALENDARIO ===
  readonly nombresMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  readonly nombresDias = ['Lu','Ma','Mi','Ju','Vi','Sá','Do'];
  readonly horariosBase = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];

  // Hora real del SERVIDOR, no del navegador: es la única referencia válida
  // para saber qué turnos ya pasaron. Si el usuario cambia el reloj de su PC,
  // esto no se ve afectado.
  horaServidor: Date | null = null;

  anioVista = 0;
  mesVista = 0;           // 0-11
  celdas: CeldaDia[] = [];
  diasLlenos = new Set<string>();
  cargandoMes = false;
  errorAgenda = '';

  fechaSeleccionada = '';
  horasOcupadas: string[] = [];
  cargandoDia = false;
  horaSeleccionada = '';

  // === FORMULARIO DE CITA ===
  cita = {
    nombre_contacto: '',
    email_contacto: '',
    telefono_contacto: '',
    tipo: 'visita' as 'visita' | 'sastreria_medida',
    aclaraciones: ''
  };
  enviandoCita = false;
  citaOk = '';
  citaError = '';

  // === FORMULARIO DE CONSULTA ===
  consulta = { nombre: '', email: '', asunto: '', mensaje: '' };
  consultaError = '';

  constructor(
    private citaService: CitaService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // /contacto?tipo=sastreria_medida abre directamente ese panel
    this.route.queryParamMap.subscribe(params => {
      const tipo = params.get('tipo');
      if (tipo === 'sastreria_medida' || tipo === 'visita') {
        this.cita.tipo = tipo;
        this.cdr.detectChanges();
      }
    });

    // Arrancamos en el mes actual según el navegador solo como punto de partida
    // visual; apenas responde el backend, todo se recalcula con su hora real.
    const provisional = new Date();
    this.anioVista = provisional.getFullYear();
    this.mesVista = provisional.getMonth();
    this.cargarMes();
  }

  // ---------- CALENDARIO ----------

  get etiquetaMes(): string {
    return `${this.nombresMeses[this.mesVista]} ${this.anioVista}`;
  }

  private claveMes(): string {
    return `${this.anioVista}-${String(this.mesVista + 1).padStart(2, '0')}`;
  }

  // Formateo manual: toISOString() convierte a UTC y en Argentina (UTC-3)
  // devolvería el día anterior para horas tempranas.
  private aFechaTexto(anio: number, mes: number, dia: number): string {
    return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  private parsearHoraServidor(texto: string): Date {
    // 'YYYY-MM-DD HH:mm:ss' -> partes numéricas (evita diferencias entre navegadores)
    const [f, h] = texto.split(' ');
    const [anio, mes, dia] = f.split('-').map(Number);
    const [hh, mm, ss] = (h || '00:00:00').split(':').map(Number);
    return new Date(anio, mes - 1, dia, hh, mm, ss);
  }

  cargarMes(): void {
    // La grilla se dibuja YA, con la mejor referencia disponible (la hora del
    // servidor si ya la tenemos, si no la del navegador), para que el calendario
    // nunca quede vacío. Cuando responde el backend se recalcula con datos reales.
    this.construirCeldas();
    this.cargandoMes = true;
    this.errorAgenda = '';

    this.citaService.getDisponibilidadMes(this.claveMes()).subscribe({
      next: (res) => {
        this.horaServidor = this.parsearHoraServidor(res.servidor_fecha_hora);
        this.diasLlenos = new Set((res.dias || []).filter(d => d.lleno).map(d => d.fecha));
        this.construirCeldas();
        this.cargandoMes = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[Agenda] Error al consultar disponibilidad del mes:', err);
        this.cargandoMes = false;
        this.errorAgenda = 'No pudimos consultar la disponibilidad. Intentá recargar la página.';
        this.cdr.detectChanges();
      }
    });
  }

  private construirCeldas(): void {
    this.celdas = [];
    const primero = new Date(this.anioVista, this.mesVista, 1);
    // getDay(): 0=domingo. Lo convertimos a 0=lunes para la grilla.
    const offset = (primero.getDay() + 6) % 7;
    const diasEnMes = new Date(this.anioVista, this.mesVista + 1, 0).getDate();

    for (let i = 0; i < offset; i++) {
      this.celdas.push({ dia: 0, fecha: '', habilitado: false, lleno: false, esHoy: false });
    }

    const hoy = this.horaServidor || new Date();
    const hoyTexto = this.aFechaTexto(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = this.aFechaTexto(this.anioVista, this.mesVista, d);
      const lleno = this.diasLlenos.has(fecha);
      // Comparación de strings 'YYYY-MM-DD': funciona lexicográficamente
      const esPasado = fecha < hoyTexto;

      this.celdas.push({
        dia: d,
        fecha,
        habilitado: !esPasado && !lleno,
        lleno,
        esHoy: fecha === hoyTexto
      });
    }
  }

  get puedeRetroceder(): boolean {
    const hoy = this.horaServidor || new Date();
    return this.anioVista > hoy.getFullYear() ||
           (this.anioVista === hoy.getFullYear() && this.mesVista > hoy.getMonth());
  }

  mesAnterior(): void {
    if (!this.puedeRetroceder) return;
    if (this.mesVista === 0) { this.mesVista = 11; this.anioVista--; }
    else this.mesVista--;
    this.limpiarSeleccion();
    this.cargarMes();
  }

  mesSiguiente(): void {
    if (this.mesVista === 11) { this.mesVista = 0; this.anioVista++; }
    else this.mesVista++;
    this.limpiarSeleccion();
    this.cargarMes();
  }

  private limpiarSeleccion(): void {
    this.fechaSeleccionada = '';
    this.horaSeleccionada = '';
    this.horasOcupadas = [];
  }

  seleccionarDia(celda: CeldaDia): void {
    if (!celda.habilitado) return;
    this.fechaSeleccionada = celda.fecha;
    this.horaSeleccionada = '';
    this.citaOk = '';
    this.citaError = '';
    this.errorAgenda = '';
    this.cargandoDia = true;

    this.citaService.getDisponibilidadDia(celda.fecha).subscribe({
      next: (res) => {
        this.horaServidor = this.parsearHoraServidor(res.servidor_fecha_hora);
        this.horasOcupadas = res.ocupados || [];
        this.cargandoDia = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[Agenda] Error al consultar horarios del día:', err);
        this.cargandoDia = false;
        this.errorAgenda = 'No pudimos consultar los horarios de ese día.';
        this.cdr.detectChanges();
      }
    });
  }

  horaDisponible(hora: string): boolean {
    if (this.horasOcupadas.includes(hora)) return false;

    // Si el día elegido es hoy, ocultamos los turnos que ya pasaron según la
    // hora del servidor. El backend revalida esto igual al reservar.
    const hoy = this.horaServidor;
    if (!hoy) return true;

    const hoyTexto = this.aFechaTexto(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (this.fechaSeleccionada !== hoyTexto) return true;

    const [hh, mm] = hora.split(':').map(Number);
    const minutosTurno = hh * 60 + mm;
    const minutosAhora = hoy.getHours() * 60 + hoy.getMinutes();
    return minutosTurno > minutosAhora;
  }

  seleccionarHora(hora: string): void {
    if (!this.horaDisponible(hora)) return;
    this.horaSeleccionada = hora;
  }

  get fechaLegible(): string {
    if (!this.fechaSeleccionada) return '';
    const [a, m, d] = this.fechaSeleccionada.split('-').map(Number);
    return `${d} de ${this.nombresMeses[m - 1]}`;
  }

  // ---------- TIPO DE CITA ----------

  get infoTipo(): any {
    return this.contenidoTipo[this.cita.tipo];
  }

  seleccionarTipo(tipo: 'visita' | 'sastreria_medida'): void {
    this.cita.tipo = tipo;
  }

  // ---------- ENVÍO DE CITA ----------

  get puedeReservar(): boolean {
    return !!this.fechaSeleccionada &&
           !!this.horaSeleccionada &&
           this.cita.nombre_contacto.trim().length > 1 &&
           this.cita.email_contacto.includes('@') &&
           this.cita.telefono_contacto.replace(/\D/g, '').length >= 8;
  }

  reservar(): void {
    this.citaOk = '';
    this.citaError = '';

    if (!this.puedeReservar) {
      this.citaError = 'Completá nombre, email y teléfono, y elegí día y horario.';
      return;
    }

    this.enviandoCita = true;

    this.citaService.crearCita({
      ...this.cita,
      fecha: this.fechaSeleccionada,
      hora: this.horaSeleccionada
    }).subscribe({
      next: () => {
        this.enviandoCita = false;
        this.citaOk = `Turno confirmado para el ${this.fechaLegible} a las ${this.horaSeleccionada}. Te escribimos por email.`;
        this.cita.aclaraciones = '';
        this.horaSeleccionada = '';
        // Refrescamos el día para que el turno recién tomado aparezca ocupado
        if (this.fechaSeleccionada) {
          this.citaService.getDisponibilidadDia(this.fechaSeleccionada).subscribe({
            next: (res) => { this.horasOcupadas = res.ocupados || []; this.cdr.detectChanges(); }
          });
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.enviandoCita = false;
        if (err?.status === 409) {
          // Otro usuario tomó ese turno mientras completábamos el formulario:
          // el UNIQUE de la base lo frenó. Recargamos el día.
          this.citaError = 'Ese horario acaba de ser reservado por otra persona. Elegí otro.';
          this.horaSeleccionada = '';
          this.citaService.getDisponibilidadDia(this.fechaSeleccionada).subscribe({
            next: (res) => { this.horasOcupadas = res.ocupados || []; this.cdr.detectChanges(); }
          });
        } else {
          this.citaError = err?.error?.message || 'No pudimos reservar el turno. Intentá de nuevo.';
        }
        this.cdr.detectChanges();
      }
    });
  }

  // ---------- CONSULTA POR MAIL ----------

  enviarConsulta(): void {
    this.consultaError = '';

    if (!this.consulta.nombre.trim() || !this.consulta.email.includes('@') || !this.consulta.mensaje.trim()) {
      this.consultaError = 'Completá nombre, email y mensaje.';
      return;
    }

    const asunto = this.consulta.asunto.trim() || 'Consulta desde la web';
    const cuerpo = `${this.consulta.mensaje}\n\n—\n${this.consulta.nombre}\n${this.consulta.email}`;
    window.location.href = `mailto:${this.emailContacto}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  }

  // ---------- WHATSAPP ----------

  get whatsappUrl(): string {
    return `https://wa.me/${this.whatsappNumero}?text=${encodeURIComponent(this.whatsappMensaje)}`;
  }
}