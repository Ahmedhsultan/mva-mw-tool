import { Component } from '@angular/core';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  template: `
    <div class="empty-state">
      <div class="empty-visual">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" stroke-width="2"/>
            <path d="M6 18h36" stroke="currentColor" stroke-width="2"/>
            <circle cx="12" cy="14" r="1.5" fill="currentColor"/>
            <circle cx="17" cy="14" r="1.5" fill="currentColor"/>
            <circle cx="22" cy="14" r="1.5" fill="currentColor"/>
            <rect x="14" y="24" width="20" height="3" rx="1.5" fill="currentColor" opacity="0.3"/>
            <rect x="18" y="30" width="12" height="3" rx="1.5" fill="currentColor" opacity="0.2"/>
          </svg>
        </div>
      </div>
      <h2>Coming Soon</h2>
      <p>This section is currently under development.<br>Check back later for updates.</p>
    </div>
  `,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 420px;
      text-align: center;
      padding: 40px 20px;
    }

    .empty-visual {
      margin-bottom: 24px;
    }

    .empty-icon {
      width: 88px;
      height: 88px;
      border-radius: 24px;
      background: var(--slate-50, #f8fafc);
      border: 1.5px dashed var(--slate-200, #e2e8f0);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--slate-300, #cbd5e1);
    }

    h2 {
      margin: 0 0 8px;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--slate-700, #334155);
      letter-spacing: -0.01em;
    }

    p {
      font-size: 0.9rem;
      color: var(--slate-400, #94a3b8);
      line-height: 1.6;
      margin: 0;
    }
  `],
})
export class PlaceholderComponent {}
