import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { routes } from './dashboard.routes';

@NgModule({
  imports: [CommonModule, RouterModule.forChild(routes)],
})
export class DashboardModule {}
