import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { authGuard } from './services/auth/auth-guard';

export const routes: Routes = [
  // Ruta principal (Home)
  { 
    path: '', 
    component: HomeComponent 
  },
  // Catálogo de Productos
  { 
    path: 'productos', 
    loadComponent: () => import('./pages/products/products').then(m => m.ProductsComponent) 
  },
  {
    path: 'productos/:id',
    loadComponent: () => import('./pages/products-detail/products-detail').then(m => m.ProductsDetailComponent)
  },
  {
    path: 'contacto',
    loadComponent: () => import('./pages/contacto/contacto').then(m => m.ContactoComponent)
  },
  // Ingreso y registro
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent)
  },

  // Lookbooks: galería pública, "mis lookbooks" y "compartidos conmigo" (?vista=...)
  {
    path: 'lookbooks',
    loadComponent: () => import('./pages/lookbooks/lookbooks').then(m => m.LookbooksComponent) //error
  },
// 'nuevo' va ANTES de ':id', si no Angular lo tomaría como un id
  {
    path: 'lookbooks/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/lookbook-editor/lookbook-editor').then(m => m.LookbookEditorComponent) //error
  },
  {
    path: 'lookbooks/:id',
    loadComponent: () => import('./pages/lookbook-detalle/lookbook-detalle').then(m => m.LookbookDetalleComponent)
  },
  {
    path: 'lookbooks/:id/editar',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/lookbook-editor/lookbook-editor').then(m => m.LookbookEditorComponent) //error
  },
  /*
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/perfil/perfil').then(m => m.PerfilComponent)
  },
  {
    path: 'pedidos',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/pedidos/pedidos').then(m => m.PedidosComponent)
  },

  // Solo administradores
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin/admin').then(m => m.AdminComponent)
  },
  */
  // Redirección por defecto si la ruta no existe (SIEMPRE AL FINAL)
  { 
    path: '**', 
    redirectTo: '' 
  }
];