import { Routes } from '@angular/router';
import { SuppliersComponent } from './suppliers/suppliers.component';
import { SuppliersDashboardComponent } from './suppliers-dashboard/suppliers-dashboard.component';
import { SupplierDashboardComponent } from './supplier-dashboard/supplier-dashboard.component';
import { SupplierFormComponent } from './supplier-form/supplier-form.component';

export const SUPPLIERS_ROUTES: Routes = [
  {
    path: '',
    component: SuppliersDashboardComponent,
    title: 'Dashboard de Proveedores',
  },
  {
    path: 'list',
    component: SuppliersComponent,
    title: 'Proveedores',
  },
  {
    path: 'dashboard/:id',
    component: SupplierDashboardComponent,
    title: 'Dashboard de Proveedor',
  },
  {
    path: 'new',
    component: SupplierFormComponent,
    title: 'Nuevo Proveedor',
  },
  {
    path: 'edit/:id',
    component: SupplierFormComponent,
    title: 'Editar Proveedor',
  },
];
