import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SaleModalComponent } from './sale-modal/sale-modal.component';
import { routes } from './sales.routes';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule.forChild(routes),
    SaleModalComponent,
  ],
  declarations: [],
  exports: [SaleModalComponent],
})
export class SalesModule {}
