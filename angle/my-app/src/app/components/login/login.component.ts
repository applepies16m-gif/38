import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

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

  let role: 'super_admin' | 'group_admin' | 'user' = 'user';
if (this.username.toLowerCase() === 'admin') {
  role = 'super_admin';
} else if (this.username.toLowerCase() === 'groupadmin') {
  role = 'group_admin';
}
this.router.navigate(['/chat'], { queryParams: { role, user: this.username } });
  }
}