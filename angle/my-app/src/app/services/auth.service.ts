import { Injectable } from '@angular/core';
import { User } from '../models/user.model';

const STORAGE_KEY = 'fabulari_currentUser';

// Tracks the real logged-in user in localStorage, not just an
// in-memory flag. This means: (1) permission checks read from a
// single source of truth instead of trusting the URL's query
// params, and (2) a page refresh no longer logs the user out,
// since the browser keeps localStorage across reloads.
@Injectable({
  providedIn: 'root'
})
export class AuthService {

  login(user: User): void {
    // Never keep the password in browser storage, even though the
    // server already strips it from the login response.
    const { password, ...safeUser } = user as any;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser));
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  isLoggedIn(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  getCurrentUser(): User | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}