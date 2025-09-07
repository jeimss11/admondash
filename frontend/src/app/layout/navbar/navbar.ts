import { Component } from '@angular/core';
import { UserMenu } from '../user-menu/user-menu';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [UserMenu],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.scss'],
})
export class Navbar {}
