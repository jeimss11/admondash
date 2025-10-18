import { Routes } from '@angular/router';
import { InvoicesListComponent } from './invoices-list/invoices-list.component';
import { SupplierDashboardComponent } from './supplier-dashboard/supplier-dashboard.component';
import { SupplierFormComponent } from './supplier-form/supplier-form.component';
import { SuppliersDashboardComponent } from './suppliers-dashboard/suppliers-dashboard.component';
import { SuppliersComponent } from './suppliers/suppliers.component';

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
    path: 'invoices',
    component: InvoicesListComponent,
    title: 'Facturas Recientes',
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
