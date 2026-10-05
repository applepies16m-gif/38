import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { User } from '../../models/user.model';
import { calculateAge, INVALID_DATE_OF_BIRTH_MESSAGE } from '../../utils/date-of-birth';

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

  // A date of birth can be set once. The field is locked as soon
  // as the account holds a valid one.
  dateOfBirth = '';
  dateOfBirthLocked = false;

  saved = false;
  profileError = '';

constructor(
  private router: Router,
  private authService: AuthService,
  private userService: UserService,
  private cdr: ChangeDetectorRef
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

  // Show the copy saved at login straight away, then replace it
  // with the server's current one.
  this.showUser(currentUser);
  this.refreshFromServer(currentUser.id);
}

  // Copies a user's details into the form fields, and locks the
  // date of birth if the account already has a valid one.
  private showUser(user: User): void {
    this.username = user.username;
    this.displayName = user.displayName;
    this.email = user.email;
    this.dateOfBirthLocked = calculateAge(user.dateOfBirth) !== null;
    this.dateOfBirth = this.dateOfBirthLocked ? (user.dateOfBirth || '') : '';
    this.cdr.markForCheck();
  }

  // Re-reads this user from the server and saves that copy to
  // localStorage, so a change made here (or by an admin) shows
  // everywhere without logging out and in.
  private refreshFromServer(userId: string): void {
    this.userService.getUsers().subscribe(users => {
      const freshUser = users.find(u => u.id === userId);
      if (!freshUser) {
        // The account no longer exists, so end the session.
        this.authService.logout();
        this.router.navigate(['/login']);
        return;
      }
      this.authService.login(freshUser);
      this.showUser(freshUser);
    });
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
  this.saved = false;
  this.profileError = '';

  const updates: Partial<User> = {
    username: this.username,
    displayName: this.displayName
  };
  // The date of birth is only sent while it is still unset. The
  // server enforces the same set-once rule.
  if (!this.dateOfBirthLocked && this.dateOfBirth) {
    if (calculateAge(this.dateOfBirth) === null) {
      this.profileError = INVALID_DATE_OF_BIRTH_MESSAGE;
      return;
    }
    updates.dateOfBirth = this.dateOfBirth;
  }

  this.userService.updateUser(currentUser.id, updates).subscribe({
    next: () => {
      this.saved = true;
      this.refreshFromServer(currentUser.id);
    },
    error: (err) => {
      this.profileError = err.error?.message || 'Your profile could not be saved.';
      this.cdr.markForCheck();
    }
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