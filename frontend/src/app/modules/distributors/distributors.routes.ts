import { Routes } from '@angular/router';
import { DistributorDashboardComponent } from './distributor-dashboard/distributor-dashboard.component';
import { DistributorsComponent } from './distributors/distributors.component';

export const routes: Routes = [
  { path: '', component: DistributorsComponent },
  { path: 'dashboard/:role', component: DistributorDashboardComponent },
];
