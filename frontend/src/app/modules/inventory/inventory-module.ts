import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { routes } from './inventory.routes';

// Importar componentes standalone
import { InventoryDashboardComponent } from './inventory-dashboard/inventory-dashboard.component';
import { InventoryReportsComponent } from './inventory-reports/inventory-reports.component';
import { InventorySettingsComponent } from './inventory-settings/inventory-settings.component';
import { InventoryComponent } from './inventory/inventory.component';

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    ReactiveFormsModule,
    FormsModule,
    // Importar componentes standalone
    InventoryComponent,
    InventoryDashboardComponent,
    InventoryReportsComponent,
    InventorySettingsComponent,
  ],
})
export class InventoryModule {}
