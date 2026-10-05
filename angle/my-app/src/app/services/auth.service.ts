import { Injectable } from '@angular/core';
import { User } from '../models/user.model';
import { SocketService } from './socket.service';
import { AppearanceService } from './appearance.service';

const STORAGE_KEY = 'fabulari_currentUser';

// Tracks the real logged-in user in localStorage, not just an
// in-memory flag. This means: (1) permission checks read from a
// single source of truth instead of trusting the URL's query
// params, and (2) a page refresh no longer logs the user out,
// since the browser keeps localStorage across reloads.
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  constructor(
    private socketService: SocketService,
    private appearanceService: AppearanceService,
  ) {
    // When the app starts (including after a refresh), put back
    // the look chosen by whoever is already logged in.
    this.appearanceService.apply(this.getCurrentUser()?.appearance);

    // Tell the server who this browser tab belongs to, so the user
    // shows as online on whichever page they are on. 'connect' also
    // fires if the connection drops and comes back, when the server
    // has forgotten the tab and needs telling again.
    this.socketService.getSocket().on('connect', () => this.announcePresence());
    this.announcePresence();
  }

  // Sends the logged-in user's id to the server over the socket.
  // The server counts this tab as one of that user's connections;
  // sending it again for the same user changes nothing.
  private announcePresence(): void {
    const currentUser = this.getCurrentUser();
    if (currentUser) {
      this.socketService.getSocket().emit('identify', { userId: currentUser.id });
    }
  }

  // Saves the logged-in user. Pages also call this to replace the
  // saved copy with a fresh one from the server, so it is the one
  // place that applies the user's chosen appearance.
  login(user: User): void {
    // Never keep the password in browser storage, even though the
    // server already strips it from the login response.
    const { password, ...safeUser } = user as any;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser));
    this.appearanceService.apply(user.appearance);
    this.announcePresence();
  }

  // Ends the session. The socket stays open while the tab does, so
  // the server is told this tab no longer belongs to anyone;
  // otherwise the user would keep showing as online after logging
  // out. The standard look is put back for the login page.
  logout(): void {
    this.socketService.getSocket().emit('signOut');
    localStorage.removeItem(STORAGE_KEY);
    this.appearanceService.apply(null);
  }

  // True if someone is logged in on this browser.
  isLoggedIn(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  // The logged-in user as saved at login (or last refreshed from the
  // server), or null if nobody is logged in.
  getCurrentUser(): User | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
