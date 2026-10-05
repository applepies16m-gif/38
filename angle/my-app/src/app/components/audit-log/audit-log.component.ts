import { Component, OnInit, ChangeDetectorRef, signal } from '@angular/core';
import { PagedList } from '../../utils/paged-list';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { AuditEntry } from '../../models/notification.model';

// Every kind of action the server writes to the audit log, with
// the wording shown in the filter and the table.
const ACTION_TYPES: { value: string; label: string }[] = [
  { value: 'join_request_approved', label: 'Join request approved' },
  { value: 'join_request_rejected', label: 'Join request rejected' },
  { value: 'group_request_approved', label: 'Group request approved' },
  { value: 'group_request_rejected', label: 'Group request rejected' },
  { value: 'ban_request_approved', label: 'Remove/ban request approved' },
  { value: 'ban_request_rejected', label: 'Remove/ban request rejected' },
  { value: 'group_created', label: 'Group created' },
  { value: 'group_updated', label: 'Group settings changed' },
  { value: 'admin_promoted', label: 'Admin promoted' },
  { value: 'admin_demoted', label: 'Admin removed' },
  { value: 'member_banned', label: 'Member banned from a group' },
  { value: 'system_ban', label: 'System ban' },
  { value: 'system_unban', label: 'System unban' },
  { value: 'role_changed', label: 'Role changed' },
  { value: 'user_created', label: 'User created' },
  { value: 'user_deleted', label: 'User deleted' },
  { value: 'channel_created', label: 'Channel created' },
  { value: 'channel_deleted', label: 'Channel deleted' },
  { value: 'report_resolved', label: 'Report resolved' },
  { value: 'report_dismissed', label: 'Report dismissed' },
  { value: 'notification_sent', label: 'Notification sent' }
];

// The Super Admin's view of every admin action, filterable by the
// kind of action and by date.
@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.css'
})
export class AuditLogComponent implements OnInit {
  // The entries the server returned for the current filters. This
  // list can be searched by text and is shown a page at a time;
  // see PagedList for how the signals inside it work.
  entryList = new PagedList<AuditEntry>(
    (entry, term) => entry.summary.toLowerCase().includes(term) ||
      entry.actorName.toLowerCase().includes(term) || this.typeLabel(entry.type).toLowerCase().includes(term),
    20
  );
  actionTypes = ACTION_TYPES;
  // A signal, so the "nothing matches" message appears as soon as
  // the server has answered.
  loaded = signal(false);

  // The three filters. Empty means "don't filter on this".
  filterType = '';
  filterFrom = '';
  filterTo = '';

  constructor(
    private router: Router,
    private authService: AuthService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.router.navigate(['/login']);
      return;
    }
    if (currentUser.role !== 'super_admin') {
      this.router.navigate(['/chat']);
      return;
    }
    this.loadEntries();
  }

  // Asks the server for the entries matching the current filters.
  // The filtering is done by the server's database query.
  loadEntries(): void {
    this.notificationService.getAuditLog(this.filterType, this.filterFrom, this.filterTo).subscribe(entries => {
      this.entryList.setItems(entries);
      this.entryList.page.set(1);
      this.loaded.set(true);
    });
  }

  // Empties all three filters and reloads.
  clearFilters(): void {
    this.filterType = '';
    this.filterFrom = '';
    this.filterTo = '';
    this.entryList.search('');
    this.loadEntries();
  }

  // The readable name of an action type.
  typeLabel(type: string): string {
    return ACTION_TYPES.find(t => t.value === type)?.label || type;
  }

  // Shows an ISO date as a short local date and time.
  formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return isNaN(date.getTime()) ? isoDate : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
}
