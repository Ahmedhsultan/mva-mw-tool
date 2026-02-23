import { inject, Injectable } from '@angular/core';
import { Auth, signInAnonymously, onAuthStateChanged, User } from '@angular/fire/auth';
import { Observable, ReplaySubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private userSubject = new ReplaySubject<User | null>(1);

  /** Observable of the current auth user */
  user$: Observable<User | null> = this.userSubject.asObservable();

  constructor() {
    // Listen for auth state changes
    onAuthStateChanged(this.auth, (user) => {
      if (user) {
        this.userSubject.next(user);
      } else {
        // Auto sign-in anonymously when no user
        this.signIn();
      }
    });
  }

  private async signIn(): Promise<void> {
    try {
      const cred = await signInAnonymously(this.auth);
      this.userSubject.next(cred.user);
    } catch (err) {
      console.error('Anonymous sign-in failed:', err);
      this.userSubject.next(null);
    }
  }
}
