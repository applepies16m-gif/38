import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  displayName = '';
  username = '';
  email = '';
  dateOfBirth = '';
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

  onRegister(): void {
    if (!this.displayName || !this.username || !this.email || !this.dateOfBirth || !this.password) {
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

    const newUser: Partial<User> = {
      username: this.username,
      password: this.password,
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
      error: () => {
        this.errorMsg = 'Registration failed — that username may already be taken.';
      }
    });
  }
}