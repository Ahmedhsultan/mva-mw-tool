import { Injectable } from '@angular/core';
import { Observable, ReplaySubject } from 'rxjs';

/** Lightweight user identity (replaces Firebase anonymous auth) */
export interface AppUser {
  uid: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private static readonly UID_KEY = 'mva_user_uid';
  private userSubject = new ReplaySubject<AppUser | null>(1);

  /** Observable of the current user identity */
  user$: Observable<AppUser | null> = this.userSubject.asObservable();

  constructor() {
    let uid = localStorage.getItem(AuthService.UID_KEY);
    if (!uid) {
      uid = crypto.randomUUID();
      localStorage.setItem(AuthService.UID_KEY, uid);
    }
    this.userSubject.next({ uid });
  }

  /** Get the current user UID synchronously */
  get uid(): string {
    return localStorage.getItem(AuthService.UID_KEY) || '';
  }
}
