import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';
import { calculateAge, INVALID_DATE_OF_BIRTH_MESSAGE } from '../../utils/date-of-birth';

@Component({
  selector: 'app-bootstrap',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './bootstrap.component.html',
  styleUrl: './bootstrap.component.css'
})
export class BootstrapComponent {
  firstName = '';
  lastName = '';
  displayName = ''; // optional; the server builds it from the names if left empty
  username = '';
  email = '';
  dateOfBirth = '';
  password = '';
  confirmPassword = '';
  errorMsg = '';

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  get passwordIsValid(): boolean {
    return this.password.length >= 8 && /[A-Z]/.test(this.password);
  }

  onBootstrap(): void {
    if (!this.firstName.trim() || !this.lastName.trim() || !this.username.trim() ||
        !this.email.trim() || !this.dateOfBirth || !this.password) {
      this.errorMsg = 'Please fill in every field (display name is optional).';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.errorMsg = 'Enter a valid email address.';
      return;
    }
    if (calculateAge(this.dateOfBirth) === null) {
      this.errorMsg = INVALID_DATE_OF_BIRTH_MESSAGE;
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
      firstName: this.firstName,
      lastName: this.lastName,
      displayName: this.displayName,
      email: this.email,
      dateOfBirth: this.dateOfBirth,
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
        // else bootstrapped it a moment ago. For anything else, show
        // the server's own reason when it gives one.
        this.errorMsg = err.status === 403
          ? 'Setup has already been completed by someone else.'
          : (err.error?.message || 'Something went wrong creating the admin account.');
        this.cdr.markForCheck();
      }
    });
  }
}