import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';

// Shown when a banned account tries to log in, and when a user is
// logged out because they were banned while using the app.
const BANNED_MESSAGE = 'This account has been banned from the system.';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  username = '';
  password = '';
  errorMsg = '';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private userService: UserService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Other pages send a banned user here with ?banned=yes so the
    // reason for being logged out is shown.
    if (this.route.snapshot.queryParamMap.get('banned')) {
      this.errorMsg = BANNED_MESSAGE;
    }

    this.userService.checkBootstrapStatus().subscribe(status => {
      if (status.needsBootstrap) {
        this.router.navigate(['/bootstrap']);
      }
    });
  }

  // Logs in. The server answers 401 for a wrong username or
  // password and 403 for an account banned from the system.
  onLogin(): void {
    if (!this.username || !this.password) {
      this.errorMsg = 'Please enter a username and password.';
      return;
    }

    this.userService.login(this.username, this.password).subscribe({
      next: (user) => {
        this.authService.login(user);
        const destination = user.role === 'super_admin' ? '/admin' : '/chat';
        this.router.navigate([destination], {
          queryParams: {
            role: user.role,
            user: user.username,
            hasGroups: user.groupIds.length > 0
          }
        });
      },
      error: (err) => {
        this.errorMsg = err.status === 403
          ? (err.error?.message || BANNED_MESSAGE)
          : 'Incorrect username or password.';
        this.cdr.markForCheck();
      }
    });
  }
}
