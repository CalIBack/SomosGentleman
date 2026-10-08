import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { ContactoComponent } from './contacto';

describe('ContactoComponent', () => {
  let component: ContactoComponent;
  let fixture: ComponentFixture<ContactoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactoComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(ContactoComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should block a slot that is already taken', () => {
    component.horasOcupadas = ['10:00'];
    component.fechaSeleccionada = '2099-01-01';
    expect(component.horaDisponible('10:00')).toBe(false);
    expect(component.horaDisponible('11:00')).toBe(true);
  });

  it('should hide past slots using the server clock, not the browser', () => {
    // El servidor dice que son las 14:30 de un día concreto
    component.horaServidor = new Date(2026, 8, 15, 14, 30, 0);
    component.fechaSeleccionada = '2026-09-15';
    component.horasOcupadas = [];

    expect(component.horaDisponible('09:00')).toBe(false);
    expect(component.horaDisponible('15:00')).toBe(true);
  });

  it('should require date, time, name, email and phone before booking', () => {
    expect(component.puedeReservar).toBe(false);

    component.fechaSeleccionada = '2099-01-01';
    component.horaSeleccionada = '10:00';
    component.cita.nombre_contacto = 'Juan Pérez';
    component.cita.email_contacto = 'juan@email.com';
    component.cita.telefono_contacto = '123456789';

    expect(component.puedeReservar).toBe(true);
  });
});