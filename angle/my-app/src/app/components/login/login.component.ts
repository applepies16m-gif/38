import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TEST_USERS } from '../../mock-data/test-users';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  username = '';
  password = '';
  errorMsg = '';

  constructor(private router: Router) {}

  onLogin(): void {
    if (!this.username || !this.password) {
      this.errorMsg = 'Please enter a username and password.';
      return;
    }

    const testUser = TEST_USERS[this.username.toLowerCase()];

    if (testUser) {
      if (this.password !== testUser.password) {
        this.errorMsg = 'Incorrect password.';
        return;
      }
      const destination = testUser.role === 'super_admin' ? '/admin' : '/chat';
      this.router.navigate([destination], {
        queryParams: { role: testUser.role, user: this.username, hasGroups: testUser.hasGroups }
      });
      return;
    }

    // Not a known test persona -- treat as a generic member, any
    // password accepted (Phase 1 mock only).
    this.router.navigate(['/chat'], {
      queryParams: { role: 'user', user: this.username, hasGroups: true }
    });
  }
}