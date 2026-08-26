import { Injectable } from '@angular/core';

// Tracks real "am I logged in" state in memory, separate from the
// role query param. The query param can survive in browser history
// (e.g. after pressing Back post-logout), but this service's state
// does not persist across a logout — so guards checking isLoggedIn()
// can't be bypassed just by navigating back to an old URL.
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private loggedIn = false;

  login(): void {
    this.loggedIn = true;
  }

  logout(): void {
    this.loggedIn = false;
  }

  isLoggedIn(): boolean {
    return this.loggedIn;
  }
}