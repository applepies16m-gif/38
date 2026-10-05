import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { AppNotification } from '../../models/notification.model';

// The page where a user reads notifications from the Super Admin.
// They are one-way: there is nothing here to reply with.
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css'
})
export class NotificationsComponent implements OnInit {
  // Signals: the template reads them, so it redraws by itself when
  // the server's answer is put into them.
  notifications = signal<AppNotification[]>([]);
  loaded = signal(false);

  constructor(
    private router: Router,
    private authService: AuthService,
    private notificationService: NotificationService
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

    this.notificationService.getNotificationsFor(currentUser.id).subscribe(notifications => {
      this.notifications.set(notifications);
      this.loaded.set(true);
    });
    // Opening this page counts as reading them.
    this.notificationService.markAllRead(currentUser.id).subscribe();
  }

  // Shows an ISO date as a short local date and time.
  formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return isNaN(date.getTime()) ? isoDate : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
}
