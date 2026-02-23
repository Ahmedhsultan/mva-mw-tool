import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EnvironmentReservationComponent } from './components/environment-reservation/environment-reservation.component';
import { PlaceholderComponent } from './components/placeholder/placeholder.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, EnvironmentReservationComponent, PlaceholderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'MVA MW Tool';
  activeTab: 'reservation' | 'placeholder' = 'reservation';

  setTab(tab: 'reservation' | 'placeholder'): void {
    this.activeTab = tab;
  }
}
