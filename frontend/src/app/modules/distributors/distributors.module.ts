import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DistributorsComponent } from './distributors/distributors.component';

const routes: Routes = [{ path: '', component: DistributorsComponent }];

@NgModule({
  imports: [CommonModule, RouterModule.forChild(routes), DistributorsComponent],
  exports: [RouterModule],
})
export class DistributorsModule {}
