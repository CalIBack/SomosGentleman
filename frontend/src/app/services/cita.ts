import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DiaOcupado {
  fecha: string;
  ocupados: number;
  lleno: boolean;
}

export interface DisponibilidadMes {
  mes: string;
  dias: DiaOcupado[];
  servidor_fecha_hora: string;
}

export interface DisponibilidadDia {
  fecha: string;
  ocupados: string[];
  servidor_fecha_hora: string;
}

@Injectable({
  providedIn: 'root'
})
export class CitaService {
  private baseUrl = 'http://localhost/SomosGentleman/backend';

  constructor(private http: HttpClient) {}

  getDisponibilidadMes(mes: string): Observable<DisponibilidadMes> {
    return this.http.get<DisponibilidadMes>(`${this.baseUrl}/disponibilidad?mes=${mes}`);
  }

  getDisponibilidadDia(fecha: string): Observable<DisponibilidadDia> {
    return this.http.get<DisponibilidadDia>(`${this.baseUrl}/disponibilidad?fecha=${fecha}`);
  }

  crearCita(datos: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/citas`, datos);
  }
}