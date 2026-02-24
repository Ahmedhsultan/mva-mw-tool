import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'MVA MW Tool';

  constructor(public router: Router) {}

  isActive(path: string): boolean {
    return this.router.url.startsWith('/' + path);
  }
}
