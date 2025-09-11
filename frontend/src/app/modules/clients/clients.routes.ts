import { Routes } from '@angular/router';
import { Clients } from './clients/clients';

export const routes: Routes = [
  { path: '', component: Clients },
  {
    path: 'dashboard/:local',
    loadComponent: () =>
      import('./client-dashboard/client-dashboard').then((m) => m.ClientDashboardComponent),
  },
];
