import { Component, HostListener } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Footer } from './footer/footer';
import { Navbar } from './navbar/navbar';
import { Sidebar } from './sidebar/sidebar';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [Sidebar, Navbar, Footer, RouterModule],
  templateUrl: './layout.html',
  styleUrls: ['./layout.scss'],
})
export class Layout {
  sidebarCollapsed = false;

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  // Cerrar sidebar en mobile cuando se hace click fuera
  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    if (event.target.innerWidth > 768) {
      this.sidebarCollapsed = false;
    }
  }
}
