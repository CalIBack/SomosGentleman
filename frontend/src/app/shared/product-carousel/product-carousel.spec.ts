import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductCarouselComponent } from './product-carousel';

describe('ProductCarousel', () => {
  let component: ProductCarouselComponent;
  let fixture: ComponentFixture<ProductCarouselComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductCarouselComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductCarouselComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
