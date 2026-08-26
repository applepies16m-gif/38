import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';


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
  email = 'you@student.griffith.edu.au'; // locked, per spec -- shown but not editable
  bio = '';
  profilePicUrl: string | null = null;

  passwordCurrent = '';
  passwordNew = '';
  passwordConfirm = '';
  passwordMsg = '';

  saved = false;

  constructor(private route: ActivatedRoute, private router: Router) {}

    ngOnInit(): void {
      const params = this.route.snapshot.queryParams;
      if (params['role'] === 'super_admin') {
        this.router.navigate(['/admin'], { queryParams: params });
        return;
      }
      this.username = params['user'] || 'guest';
      this.displayName = params['user'] || 'Guest';
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
    // TODO Phase 2: PUT /api/users/:id
    this.saved = true;
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
    // TODO Phase 2: verify passwordCurrent against the server, then update.
    this.passwordMsg = 'Password updated (mock).';
    this.passwordCurrent = '';
    this.passwordNew = '';
    this.passwordConfirm = '';
  }
}