import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent implements OnInit {
  modo: 'ingresar' | 'registrar' = 'ingresar';

  // Ingreso
  email = '';
  password = '';

  // Registro
  regNombre = '';
  regEmail = '';
  regPassword = '';
  regPassword2 = '';

  procesando = false;
  error = '';
  aviso = '';

  private volverA = '/';

  constructor(
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.volverA = params.get('volverA') || '/';
      if (params.get('modo') === 'registrar') this.modo = 'registrar';
      this.cdr.detectChanges();
    });

    // Si ya hay sesión activa, no tiene sentido mostrar el formulario
    if (this.auth.estaLogueado()) {
      this.router.navigateByUrl(this.volverA);
    }
  }

  cambiarModo(modo: 'ingresar' | 'registrar'): void {
    this.modo = modo;
    this.error = '';
    this.aviso = '';
  }

  ingresar(): void {
    this.error = '';
    this.aviso = '';

    if (!this.email.includes('@') || this.password.length < 1) {
      this.error = 'Ingresá tu email y contraseña.';
      return;
    }

    this.procesando = true;

    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        this.procesando = false;
        this.router.navigateByUrl(this.volverA);
      },
      error: (err) => {
        this.procesando = false;
        this.error = err?.status === 401
          ? 'Email o contraseña incorrectos.'
          : (err?.error?.message || 'No pudimos iniciar sesión. Intentá de nuevo.');
        this.cdr.detectChanges();
      }
    });
  }

  registrar(): void {
    this.error = '';
    this.aviso = '';

    if (this.regNombre.trim().length < 2) {
      this.error = 'Escribí tu nombre y apellido.';
      return;
    }
    if (!this.regEmail.includes('@')) {
      this.error = 'El email no es válido.';
      return;
    }
    if (this.regPassword.length < 6) {
      this.error = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }
    if (this.regPassword !== this.regPassword2) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }

    this.procesando = true;

    this.auth.registrar(this.regNombre.trim(), this.regEmail.trim(), this.regPassword).subscribe({
      next: () => {
        // El backend crea la cuenta pero no devuelve token, así que iniciamos
        // sesión enseguida: al usuario le queda un solo paso, no dos.
        this.auth.login(this.regEmail.trim(), this.regPassword).subscribe({
          next: () => {
            this.procesando = false;
            this.router.navigateByUrl(this.volverA);
          },
          error: () => {
            this.procesando = false;
            this.aviso = 'Tu cuenta se creó correctamente. Iniciá sesión para continuar.';
            this.modo = 'ingresar';
            this.email = this.regEmail.trim();
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        this.procesando = false;
        this.error = err?.status === 409
          ? 'Ya existe una cuenta con ese email.'
          : (err?.error?.message || 'No pudimos crear la cuenta. Intentá de nuevo.');
        this.cdr.detectChanges();
      }
    });
  }
}