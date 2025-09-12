import { Routes } from '@angular/router';
import { InventoryDashboardComponent } from './inventory-dashboard/inventory-dashboard.component';
import { InventoryReportsComponent } from './inventory-reports/inventory-reports.component';
import { InventorySettingsComponent } from './inventory-settings/inventory-settings.component';
import { InventoryComponent } from './inventory/inventory.component';

export const routes: Routes = [
  { path: '', component: InventoryDashboardComponent },
  { path: 'products', component: InventoryComponent },
  { path: 'reports', component: InventoryReportsComponent },
  { path: 'settings', component: InventorySettingsComponent },
  { path: 'dashboard', component: InventoryDashboardComponent },
];
