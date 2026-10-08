import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router'; // Herramientas de navegación
import { AuthService } from '../../services/auth/auth';

@Component({
  selector: 'app-navbar',
  imports: [CommonModule, RouterLink, RouterLinkActive], // Las activamos en este componente
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar {
  // Public para poder leerlo directo desde el template. Al ser signals, la barra
  // se redibuja sola cuando el usuario entra o sale, sin detectChanges().
  readonly auth = inject(AuthService);
  private router = inject(Router);

  cerrarSesion(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}