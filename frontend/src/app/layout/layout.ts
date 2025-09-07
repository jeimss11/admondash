import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [MatSidenavModule, MatToolbarModule, MatIconModule, MatListModule, RouterModule],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {}
