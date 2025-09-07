import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';

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
        loadChildren: () => import('./modules/dashboard/dashboard-module').then((m) => m.DashboardModule),
      },
      {
        path: 'sales',
        loadChildren: () => import('./modules/sales/sales-module').then((m) => m.SalesModule),
      },
      {
        path: 'clients',
        loadChildren: () => import('./modules/clients/clients-module').then((m) => m.ClientsModule),
      },
      {
        path: 'expenses',
        loadChildren: () => import('./modules/expenses/expenses-module').then((m) => m.ExpensesModule),
      },
      {
        path: 'distributors',
        loadChildren: () => import('./modules/distributors/distributors-module').then((m) => m.DistributorsModule),
      },
      {
        path: 'inventory',
        loadChildren: () => import('./modules/inventory/inventory-module').then((m) => m.InventoryModule),
      },
      {
        path: 'reports',
        loadChildren: () => import('./modules/reports/reports-module').then((m) => m.ReportsModule),
      },
      {
        path: 'users',
        loadChildren: () => import('./modules/users/users-module').then((m) => m.UsersModule),
      },
      {
        path: 'suppliers',
        loadChildren: () => import('./modules/suppliers/suppliers-module').then((m) => m.SuppliersModule),
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
