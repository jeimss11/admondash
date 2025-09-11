import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Chart, registerables } from 'chart.js';

@Component({
  selector: 'app-distributors',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './distributors.component.html',
  styleUrls: ['./distributors.component.scss'],
})
export class DistributorsComponent implements OnInit {
  distributors = [
    { name: 'Distribuidor 1', contact: '123456789', totalSales: 1000, status: 'Activo' },
    { name: 'Distribuidor 2', contact: '987654321', totalSales: 500, status: 'Inactivo' },
  ];

  constructor() {
    Chart.register(...registerables);
  }

  ngOnInit(): void {
    // Initialization logic here
  }

  openDashboard(distributor: any): void {
    console.log('Opening dashboard for:', distributor);
  }

  editDistributor(distributor: any): void {
    console.log('Editing distributor:', distributor);
  }

  deleteDistributor(distributor: any): void {
    console.log('Deleting distributor:', distributor);
  }
}
