import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { DistributorDashboardComponent } from './distributor-dashboard/distributor-dashboard.component';
import { DistributorsComponent } from './distributors/distributors.component';

const routes: Routes = [
  { path: '', component: DistributorsComponent },
  { path: 'dashboard/:role', component: DistributorDashboardComponent },
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    FormsModule,
    DistributorsComponent,
    DistributorDashboardComponent,
  ],
  exports: [RouterModule],
})
export class DistributorsModule {}
