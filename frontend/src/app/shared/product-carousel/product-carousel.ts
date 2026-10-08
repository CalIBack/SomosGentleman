import { Component, Input, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductCardComponent } from '../product-card/product-card'; // Ajustar ruta según estructura de carpetas

@Component({
  selector: 'app-product-carousel',
  standalone: true,
  imports: [CommonModule, ProductCardComponent],
  templateUrl: './product-carousel.html',
  styleUrl: './product-carousel.scss'
})
export class ProductCarouselComponent {
  @Input() productos: any[] = [];
  @ViewChild('carouselContainer') carouselContainer!: ElementRef;

  scroll(direccion: number): void {
    if (this.carouselContainer) {
      const container = this.carouselContainer.nativeElement;
      const scrollAmount = container.clientWidth;
      container.scrollBy({ left: scrollAmount * direccion, behavior: 'smooth' });
    }
  }
}