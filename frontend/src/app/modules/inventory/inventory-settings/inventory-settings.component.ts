import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-inventory-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inventory-settings.html',
  styleUrl: './inventory-settings.scss',
})
export class InventorySettingsComponent {
  constructor(private router: Router) {}

  goBack() {
    this.router.navigate(['/inventory']);
  }
}
