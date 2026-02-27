import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { SettingsComponent } from './components/settings/settings.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, SettingsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'MVA MW Tool';
  showSettings = false;

  constructor(public router: Router) {}

  isActive(path: string): boolean {
    return this.router.url.startsWith('/' + path);
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }
}
