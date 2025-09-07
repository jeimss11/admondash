import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./modules/login/login/login').then((m) => m.Login),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'dashboard',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./modules/dashboard/dashboard-module').then((m) => m.DashboardModule),
  },
  {
    path: 'sales',
    canActivate: [AuthGuard],
    loadChildren: () => import('./modules/sales/sales-module').then((m) => m.SalesModule),
  },
  {
    path: 'clients',
    canActivate: [AuthGuard],
    loadChildren: () => import('./modules/clients/clients-module').then((m) => m.ClientsModule),
  },
  {
    path: 'expenses',
    canActivate: [AuthGuard],
    loadChildren: () => import('./modules/expenses/expenses-module').then((m) => m.ExpensesModule),
  },
  {
    path: 'distributors',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./modules/distributors/distributors-module').then((m) => m.DistributorsModule),
  },
  {
    path: 'inventory',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./modules/inventory/inventory-module').then((m) => m.InventoryModule),
  },
  {
    path: 'reports',
    canActivate: [AuthGuard],
    loadChildren: () => import('./modules/reports/reports-module').then((m) => m.ReportsModule),
  },
  {
    path: 'users',
    canActivate: [AuthGuard],
    loadChildren: () => import('./modules/users/users-module').then((m) => m.UsersModule),
  },
  {
    path: 'suppliers',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./modules/suppliers/suppliers-module').then((m) => m.SuppliersModule),
  },
  { path: '**', redirectTo: 'dashboard' },
];
