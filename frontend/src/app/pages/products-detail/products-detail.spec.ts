import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { convertToParamMap } from '@angular/router';

import { ProductsDetailComponent } from './products-detail';

describe('ProductsDetailComponent', () => {
  let component: ProductsDetailComponent;
  let fixture: ComponentFixture<ProductsDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsDetailComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: '1' }))
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsDetailComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should calculate final price with a percentage discount', () => {
    component.producto = { precio: 100000, descuento: '20%' };
    expect(component.precioFinal).toBe(80000);
  });

  it('should calculate final price with a fixed discount', () => {
    component.producto = { precio: 140000, descuento: '-10000' };
    expect(component.precioFinal).toBe(130000);
  });

  it('should not allow buying when there is no stock', () => {
    component.producto = { precio: 1000, variaciones_stock: [{ id: 1, talle: 'M', stock: 0 }] };
    expect(component.hayStock).toBeFalsy();
    expect(component.puedeComprar).toBeFalsy();
  });
});