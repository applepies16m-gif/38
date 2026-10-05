import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';
import { calculateAge, INVALID_DATE_OF_BIRTH_MESSAGE } from '../../utils/date-of-birth';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
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

  onRegister(): void {
    if (!this.firstName.trim() || !this.lastName.trim() || !this.username.trim() ||
        !this.email.trim() || !this.dateOfBirth || !this.password) {
      this.errorMsg = 'Please fill in every field (display name is optional).';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.errorMsg = 'Enter a valid email address.';
      return;
    }
    // The server applies the same rule; checking here just gives
    // the answer without a round trip.
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

    const newUser: Partial<User> = {
      username: this.username,
      password: this.password,
      firstName: this.firstName,
      lastName: this.lastName,
      displayName: this.displayName,
      email: this.email,
      dateOfBirth: this.dateOfBirth,
      role: 'user',
      online: true,
      groupIds: [],
      bannedFromGroupIds: [],
      isSystemBanned: false
    };

    this.userService.createUser(newUser).subscribe({
      next: (createdUser) => {
        this.authService.login(createdUser);
        this.router.navigate(['/chat'], {
          queryParams: { role: createdUser.role, user: createdUser.username, hasGroups: false }
        });
      },
      error: (err) => {
        // Show the server's own reason when it gives one.
        this.errorMsg = err.error?.message || 'Registration failed — that username may already be taken.';
        this.cdr.markForCheck();
      }
    });
  }
}