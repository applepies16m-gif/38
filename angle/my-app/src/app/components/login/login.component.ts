import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { Component, OnInit } from '@angular/core';

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
    private userService: UserService,
    private authService: AuthService
  ) {}
  ngOnInit(): void {
  this.userService.checkBootstrapStatus().subscribe(status => {
    if (status.needsBootstrap) {
      this.router.navigate(['/bootstrap']);
    }
  });
}

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
      error: () => {
        this.errorMsg = 'Incorrect username or password.';
      }
    });
  }
}