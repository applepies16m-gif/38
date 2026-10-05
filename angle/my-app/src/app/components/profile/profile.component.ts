import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { UploadService } from '../../services/upload.service';
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
  profilePicUrl: string | null = null; // full address of the saved picture, or null if none
  pictureMsg = '';
  pictureError = '';

  passwordCurrent = '';
  passwordNew = '';
  passwordConfirm = '';
  passwordMsg = '';

  // A date of birth can be set once. The field is locked as soon
  // as the account holds a valid one.
  dateOfBirth = '';
  dateOfBirthLocked = false;

  // Users this person has blocked in chat, with names for display.
  blockedUsers: { id: string; name: string }[] = [];

  saved = false;
  profileError = '';
  deleteError = '';

constructor(
  private router: Router,
  private authService: AuthService,
  private userService: UserService,
  private uploadService: UploadService,
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
    this.profilePicUrl = user.profilePicUrl ? this.uploadService.fullUrl(user.profilePicUrl) : null;
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
      // Banned from the whole system while logged in: end the
      // session and let the login page explain why.
      if (freshUser.isSystemBanned) {
        this.authService.logout();
        this.router.navigate(['/login'], { queryParams: { banned: 'yes' } });
        return;
      }
      this.authService.login(freshUser);
      this.showUser(freshUser);

      // The account only holds the ids of blocked users; look up
      // their names for the Blocked Users list.
      this.blockedUsers = (freshUser.blockedUserIds || []).map(id => ({
        id,
        name: users.find(u => u.id === id)?.displayName || 'deleted user'
      }));
      this.cdr.markForCheck();
    });
  }

  // Removes a block, so that user's messages are shown again.
  unblock(blockedUserId: string): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return;
    }
    this.userService.unblockUser(currentUser.id, blockedUserId).subscribe(() => {
      this.refreshFromServer(currentUser.id);
    });
  }

  // Runs when a picture is chosen. The file is checked, uploaded to
  // the server, and its path saved on this user's account, so the
  // picture is still there after a reload or on another computer.
  onPictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clear the picker so choosing the same file again still fires.
    input.value = '';
    const currentUser = this.authService.getCurrentUser();
    if (!file || !currentUser) {
      return;
    }

    this.pictureMsg = '';
    this.pictureError = this.uploadService.checkImage(file);
    if (this.pictureError) {
      return;
    }

    this.uploadService.uploadImage(file).subscribe({
      next: (uploaded) => {
        this.userService.updateUser(currentUser.id, { profilePicUrl: uploaded.imageUrl }).subscribe({
          next: () => {
            this.pictureMsg = 'Profile picture updated.';
            this.refreshFromServer(currentUser.id);
          },
          error: (err) => this.showPictureError(err)
        });
      },
      error: (err) => this.showPictureError(err)
    });
  }

  // Shows why a picture could not be uploaded or saved, using the
  // server's own message when it gives one.
  private showPictureError(err: any): void {
    this.pictureError = err.error?.message || 'The picture could not be uploaded.';
    this.cdr.markForCheck();
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
      this.userService.updateUser(currentUser.id, { password: this.passwordNew }).subscribe({
        next: () => {
          this.passwordMsg = 'Password updated.';
          this.passwordCurrent = '';
          this.passwordNew = '';
          this.passwordConfirm = '';
          this.cdr.markForCheck();
        },
        // The server applies the password rule too.
        error: (err) => {
          this.passwordMsg = err.error?.message || 'The password could not be updated.';
          this.cdr.markForCheck();
        }
      });
    },
    error: () => {
      this.passwordMsg = 'Current password is incorrect.';
      this.cdr.markForCheck();
    }
  });
}

  // Permanently deletes this user's own account, then logs out.
  // The server refuses if they are the only admin of a group and
  // says another admin must be appointed first; that message is
  // shown as it is.
  deleteMyAccount(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return;
    }
    const confirmed = confirm('Permanently delete your account? This cannot be undone.');
    if (!confirmed) {
      return;
    }
    this.deleteError = '';
    this.userService.deleteUser(currentUser.id).subscribe({
      next: () => {
        this.authService.logout();
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.deleteError = err.error?.message || 'Your account could not be deleted.';
        this.cdr.markForCheck();
      }
    });
  }
}