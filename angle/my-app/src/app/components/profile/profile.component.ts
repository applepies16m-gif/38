import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
  username = '';
  displayName = '';
  email = ''; // locked, per spec -- shown but not editable; set from AuthService in ngOnInit
  bio = '';
  profilePicUrl: string | null = null;

  passwordCurrent = '';
  passwordNew = '';
  passwordConfirm = '';
  passwordMsg = '';

  saved = false;

constructor(
  private router: Router,
  private authService: AuthService,
  private userService: UserService
) {}

ngOnInit(): void {
  const currentUser = this.authService.getCurrentUser();
  if (!currentUser) {
    this.router.navigate(['/login']);
    return;
  }

  if (currentUser.role === 'super_admin') {
    this.router.navigate(['/admin']);
    return;
  }

  this.username = currentUser.username;
  this.displayName = currentUser.displayName;
  this.email = currentUser.email;
}
  onPictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    // Phase 1: preview only, held in the browser -- not uploaded
    // anywhere yet. Phase 2 will POST this to the server.
    const reader = new FileReader();
    reader.onload = () => {
      this.profilePicUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

 saveProfile(): void {
  const currentUser = this.authService.getCurrentUser();
  if (!currentUser) {
    return;
  }
  this.userService.updateUser(currentUser.id, {
    username: this.username,
    displayName: this.displayName
  }).subscribe(() => {
    this.saved = true;
  });
}

  changePassword(): void {
  if (!this.passwordCurrent || !this.passwordNew || !this.passwordConfirm) {
    this.passwordMsg = 'Please fill in all three password fields.';
    return;
  }
  if (this.passwordNew.length < 8 || !/[A-Z]/.test(this.passwordNew)) {
    this.passwordMsg = 'New password must be at least 8 characters with an uppercase letter.';
    return;
  }
  if (this.passwordNew !== this.passwordConfirm) {
    this.passwordMsg = 'New password and confirmation do not match.';
    return;
  }

  const currentUser = this.authService.getCurrentUser();
  if (!currentUser) {
    return;
  }

  // Verify the current password by attempting a real login with
  // it -- reuses the existing login check rather than needing a
  // separate "verify password" endpoint.
  this.userService.login(currentUser.username, this.passwordCurrent).subscribe({
    next: () => {
      this.userService.updateUser(currentUser.id, { password: this.passwordNew }).subscribe(() => {
        this.passwordMsg = 'Password updated.';
        this.passwordCurrent = '';
        this.passwordNew = '';
        this.passwordConfirm = '';
      });
    },
    error: () => {
      this.passwordMsg = 'Current password is incorrect.';
    }
  });
}
}