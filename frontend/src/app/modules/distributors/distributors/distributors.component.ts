import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';

@Component({
  selector: 'app-distributors',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './distributors.component.html',
  styleUrls: ['./distributors.component.scss'],
})
export class DistributorsComponent implements OnInit {
  distributors = [
    { id: 1, name: 'Distribuidor 1', contact: '123456789', totalSales: 1000, status: 'Activo' },
    { id: 2, name: 'Distribuidor 2', contact: '987654321', totalSales: 500, status: 'Inactivo' },
  ];

  constructor(private router: Router) {
    Chart.register(...registerables);
  }

  ngOnInit(): void {
    // Initialization logic here
  }

  openDashboard(distributor: any): void {
    this.router.navigate(['/distributors/dashboard', distributor.id]);
  }

  editDistributor(distributor: any): void {
    console.log('Editing distributor:', distributor);
  }

  deleteDistributor(distributor: any): void {
    console.log('Deleting distributor:', distributor);
  }
}
