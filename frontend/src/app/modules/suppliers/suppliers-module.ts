import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SUPPLIERS_ROUTES } from './suppliers.routes';

@NgModule({
  imports: [CommonModule, RouterModule.forChild(SUPPLIERS_ROUTES)],
})
export class SuppliersModule {}
