import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './shared/navbar/navbar';
import { HomeComponent } from "./pages/home/home";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, HomeComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss' 
})
export class App {
  title = 'frontend';
}