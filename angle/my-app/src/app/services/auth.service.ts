import { Injectable } from '@angular/core';
import { User } from '../models/user.model';
import { SocketService } from './socket.service';

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
  constructor(private socketService: SocketService) {}

  login(user: User): void {
    // Never keep the password in browser storage, even though the
    // server already strips it from the login response.
    const { password, ...safeUser } = user as any;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser));
  }

  // Ends the session. The socket stays open while the tab does, so
  // the server is told this tab no longer belongs to anyone;
  // otherwise the user would keep showing as online after logging
  // out.
  logout(): void {
    this.socketService.getSocket().emit('signOut');
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
