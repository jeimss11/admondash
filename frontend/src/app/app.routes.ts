import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { PermissionGuard } from './core/guards/permission.guard';

import { Layout } from './layout/layout';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./modules/login/login/login').then((m) => m.Login),
  },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: '',
    canActivate: [AuthGuard],
    component: Layout,
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./modules/dashboard/dashboard-module').then((m) => m.DashboardModule),
      },
      {
        path: 'sales',
        canActivate: [PermissionGuard], data: { permission: 'ventas.leer' },
        loadChildren: () => import('./modules/sales/sales-module').then((m) => m.SalesModule),
      },
      {
        path: 'clients',
        canActivate: [PermissionGuard], data: { permission: 'clientes.leer' },
        loadChildren: () => import('./modules/clients/clients-module').then((m) => m.ClientsModule),
      },
      {
        path: 'expenses',
        canActivate: [PermissionGuard], data: { permission: 'gastos.leer' },
        loadChildren: () =>
          import('./modules/expenses/expenses-module').then((m) => m.ExpensesModule),
      },
      {
        path: 'distributors',
        canActivate: [PermissionGuard], data: { permission: 'caja.leer' },
        loadChildren: () =>
          import('./modules/distributors/distributors.module').then((m) => m.DistributorsModule),
      },
      {
        path: 'inventory',
        canActivate: [PermissionGuard], data: { permission: 'catalogo.leer' },
        loadChildren: () =>
          import('./modules/inventory/inventory-module').then((m) => m.InventoryModule),
      },
      {
        path: 'reports',
        canActivate: [PermissionGuard], data: { permission: 'reportes.leer' },
        loadChildren: () => import('./modules/reports/reports-module').then((m) => m.ReportsModule),
      },
      {
        path: 'users',
        canActivate: [PermissionGuard], data: { ownerOnly: true },
        loadChildren: () => import('./modules/users/users-module').then((m) => m.UsersModule),
      },
      {
        path: 'suppliers',
        canActivate: [PermissionGuard], data: { permission: 'proveedores.leer' },
        loadChildren: () =>
          import('./modules/suppliers/suppliers-module').then((m) => m.SuppliersModule),
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
