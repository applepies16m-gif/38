import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-bootstrap',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './bootstrap.component.html',
  styleUrl: './bootstrap.component.css'
})
export class BootstrapComponent {
  displayName = '';
  username = '';
  email = '';
  password = '';
  confirmPassword = '';
  errorMsg = '';

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private router: Router
  ) {}

  get passwordIsValid(): boolean {
    return this.password.length >= 8 && /[A-Z]/.test(this.password);
  }

  onBootstrap(): void {
    if (!this.displayName || !this.username || !this.email || !this.password) {
      this.errorMsg = 'Please fill in every field.';
      return;
    }
    if (!this.passwordIsValid) {
      this.errorMsg = 'Password must be at least 8 characters and include an uppercase letter.';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMsg = 'Passwords do not match.';
      return;
    }

    const newSuperAdmin: Partial<User> = {
      username: this.username,
      password: this.password,
      displayName: this.displayName,
      email: this.email,
      role: 'super_admin',
      online: true,
      groupIds: [],
      bannedFromGroupIds: [],
      isSystemBanned: false
    };

    this.userService.bootstrapSuperAdmin(newSuperAdmin).subscribe({
      next: (createdUser) => {
        this.authService.login(createdUser);
        this.router.navigate(['/admin']);
      },
      error: (err) => {
        // 403 specifically means the server has already seen a real
        // user get created since this page loaded -- e.g. someone
        // else bootstrapped it a moment ago. Any other error is a
        // more generic failure.
        this.errorMsg = err.status === 403
          ? 'Setup has already been completed by someone else.'
          : 'Something went wrong creating the admin account.';
      }
    });
  }
}