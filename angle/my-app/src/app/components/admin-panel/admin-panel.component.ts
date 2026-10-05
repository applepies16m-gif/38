import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {Router, RouterLink } from '@angular/router';
import { User } from '../../models/user.model';
import { Group, GroupCreationRequest, BanRequest } from '../../models/group.model';
import { UserService } from '../../services/user.service';
import { GroupService } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
import { ReportService } from '../../services/report.service';
import { Report } from '../../models/report.model';
import { NotificationService } from '../../services/notification.service';
import { AppNotification } from '../../models/notification.model';
import { calculateAge, INVALID_DATE_OF_BIRTH_MESSAGE } from '../../utils/date-of-birth';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-panel.component.html',
  styleUrl: './admin-panel.component.css'
})
export class AdminPanelComponent implements OnInit {
  users: User[] = [];
  groups: Group[] = [];

  groupRequests: GroupCreationRequest[] = [];

  // Reports made by users about other users, newest first.
  reports: Report[] = [];

  // Every remove/ban request; this page only shows the ones that
  // are about a Group Admin.
  banRequests: BanRequest[] = [];

  // The notification being written, and those already sent.
  notificationMessage = '';
  notificationRecipientId = ''; // empty = everyone
  sentNotifications: AppNotification[] = [];

  newUsername = '';
  newFirstName = '';
  newLastName = '';
  newEmail = '';
  newDisplayName = '';
  newPassword = '';
  newDateOfBirth = ''; // optional for accounts an admin creates
  newGroupName = '';
  newGroupAdminId = ''; // the user chosen as the new group's admin

  constructor(
    private userService: UserService,
    private groupService: GroupService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private authService: AuthService,
    private reportService: ReportService,
    private notificationService: NotificationService
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

    this.userService.getUsers().subscribe(users => {
      this.users = users;
      this.cdr.markForCheck();
    });

    this.groupService.getGroups().subscribe(groups => {
      this.groups = groups;
      this.cdr.markForCheck();
    });
    this.groupService.getGroupRequests().subscribe(requests => {
      this.groupRequests = requests;
      this.cdr.markForCheck();
    });
    this.reportService.getReports().subscribe(reports => {
      this.reports = reports;
      this.cdr.markForCheck();
    });
    this.groupService.getBanRequests().subscribe(requests => {
      this.banRequests = requests;
      this.cdr.markForCheck();
    });
    this.notificationService.getAllNotifications().subscribe(notifications => {
      this.sentNotifications = notifications;
      this.cdr.markForCheck();
    });
  }

  // Sends a one-way notification to everyone, or to the one user
  // chosen in the "To" box. Users read it on their Notifications
  // page; there is no way for them to reply.
  sendNotification(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return;
    }
    if (!this.notificationMessage.trim()) {
      alert('Write a message to send.');
      return;
    }
    this.notificationService.sendNotification(
      currentUser.id, this.notificationMessage, this.notificationRecipientId || null
    ).subscribe({
      next: (sent) => {
        this.sentNotifications = [sent, ...this.sentNotifications];
        this.notificationMessage = '';
        this.notificationRecipientId = '';
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The notification could not be sent.');
      }
    });
  }

  // Shows an ISO date as a short local date and time.
  formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return isNaN(date.getTime()) ? isoDate : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  // Ends the Super Admin's session.
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  // Requests from one Group Admin to remove or ban another admin
  // of the same group. Only the Super Admin can decide these.
  get adminRemovalRequests(): BanRequest[] {
    return this.banRequests.filter(r => r.reviewer === 'super_admin' && r.status === 'pending');
  }

  // Approves a request to remove or ban a Group Admin. The server
  // takes them out of the group and its admin list, and refuses if
  // that would leave the group with no admin.
  approveAdminRemoval(req: BanRequest): void {
    this.groupService.updateBanRequest(req.id, 'approved').subscribe({
      next: () => {
        req.status = 'approved';
        // Roles and memberships changed on the server, so re-read
        // the Users and Groups tables.
        this.userService.getUsers().subscribe(users => {
          this.users = users;
          this.cdr.markForCheck();
        });
        this.groupService.getGroups().subscribe(groups => {
          this.groups = groups;
          this.cdr.markForCheck();
        });
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The request could not be approved.');
      }
    });
  }

  // Rejects a request to remove or ban a Group Admin, with a reason.
  rejectAdminRemoval(req: BanRequest): void {
    const reason = prompt('Reason for rejecting this request?');
    if (reason === null) {
      return;
    }
    this.groupService.updateBanRequest(req.id, 'rejected', reason).subscribe({
      next: () => {
        req.status = 'rejected';
        req.rejectionReason = reason;
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The request could not be rejected.');
      }
    });
  }

  // Title of a group, for tables that only hold its id.
  groupTitle(groupId: string): string {
    return this.groups.find(g => g.id === groupId)?.title || groupId;
  }

  // Records the Super Admin's decision on a report: 'resolved'
  // (something was done) or 'dismissed' (nothing needed), with an
  // optional note that the group's admins can read.
  decideReport(report: Report, status: 'resolved' | 'dismissed'): void {
    const note = prompt(`Note for this decision (${status}), or leave empty:`);
    if (note === null) {
      return;
    }
    this.saveReportDecision(report, status, note);
  }

  // Bans the reported user from the whole system and marks the
  // report resolved in one step.
  banReportedUser(report: Report): void {
    const user = this.users.find(u => u.id === report.reportedUserId);
    if (!user) {
      alert('That user no longer exists.');
      return;
    }
    if (!confirm(`Ban ${user.displayName} from the entire system and resolve this report?`)) {
      return;
    }
    this.userService.updateUser(user.id, { isSystemBanned: true }).subscribe({
      next: () => {
        user.isSystemBanned = true;
        this.saveReportDecision(report, 'resolved', 'User banned from the system.');
      },
      error: (err) => {
        alert(err.error?.message || 'The user could not be banned.');
      }
    });
  }

  // Sends a report decision to the server, then updates the row.
  private saveReportDecision(report: Report, status: 'resolved' | 'dismissed', note: string): void {
    this.reportService.decideReport(report.id, status, note).subscribe({
      next: () => {
        report.status = status;
        report.decisionNote = note;
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The decision could not be saved.');
      }
    });
  }

  // Creates a user account from the Admin Panel form. The date of
  // birth is optional here, but is checked if one is entered.
  requestNewUser(): void {
    if (!this.newUsername.trim() || !this.newFirstName.trim() || !this.newLastName.trim() ||
        !this.newEmail.trim() || !this.newPassword.trim()) {
      alert('Username, first name, last name, email and password are all required.');
      return;
    }
    if (this.newPassword.length < 8 || !/[A-Z]/.test(this.newPassword)) {
      alert('Password must be at least 8 characters and include an uppercase letter.');
      return;
    }
    if (this.newDateOfBirth && calculateAge(this.newDateOfBirth) === null) {
      alert(INVALID_DATE_OF_BIRTH_MESSAGE);
      return;
    }
    const newUser: Partial<User> = {
      username: this.newUsername,
      password: this.newPassword,
      firstName: this.newFirstName,
      lastName: this.newLastName,
      // Left empty, the server builds it from the first and last name.
      displayName: this.newDisplayName,
      email: this.newEmail,
      role: 'user',
      online: false,
      groupIds: [],
      bannedFromGroupIds: [],
      isSystemBanned: false
    };
    if (this.newDateOfBirth) {
      newUser.dateOfBirth = this.newDateOfBirth;
    }
    this.userService.createUser(newUser).subscribe({
      next: (createdUser) => {
        this.users.push(createdUser);
        this.newUsername = '';
        this.newFirstName = '';
        this.newLastName = '';
        this.newEmail = '';
        this.newDisplayName = '';
        this.newPassword = '';
        this.newDateOfBirth = '';
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The user could not be created.');
      }
    });
  }

  // Users who can be chosen as a new group's admin: anyone who is
  // not a Super Admin and not banned from the system.
  get possibleGroupAdmins(): User[] {
    return this.users.filter(u => u.role !== 'super_admin' && !u.isSystemBanned);
  }

  // Display name for a user id, for tables that only hold the id.
  userName(userId: string): string {
    return this.users.find(u => u.id === userId)?.displayName || userId;
  }

  // The server makes a new group's admin a member and a Group
  // Admin. This repeats that on the copy held by this page, so the
  // Users table is right without reloading.
  private showAsGroupAdmin(userId: string, groupId: string): void {
    const user = this.users.find(u => u.id === userId);
    if (!user) {
      return;
    }
    if (!user.groupIds.includes(groupId)) {
      user.groupIds = [...user.groupIds, groupId];
    }
    if (user.role === 'user') {
      user.role = 'group_admin';
    }
  }

  // Creates a group directly. A group must have an admin from the
  // start, so one has to be chosen; the server refuses otherwise.
  createGroup(): void {
    if (!this.newGroupName.trim()) {
      alert('Enter a name for the group.');
      return;
    }
    if (!this.newGroupAdminId) {
      alert('Choose who will be the group\'s admin.');
      return;
    }
    const adminId = this.newGroupAdminId;
    const newGroup: Partial<Group> = {
      title: this.newGroupName,
      description: '',
      ageLimit: 0,
      adminIds: [adminId],
      channelIds: []
    };
    this.groupService.createGroup(newGroup).subscribe({
      next: (createdGroup) => {
        this.groups.push(createdGroup);
        this.showAsGroupAdmin(adminId, createdGroup.id);
        this.newGroupName = '';
        this.newGroupAdminId = '';
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The group could not be created.');
      }
    });
  }

  groupNames(user: User): string {
    return user.groupIds
      .map(id => this.groups.find(g => g.id === id)?.title)
      .filter(Boolean)
      .join(', ') || '--';
  }

  // Deletes a user's account. The server refuses if they are the
  // only admin of a group (or the only Super Admin) and says who
  // needs appointing first; that message is shown as it is.
  removeUser(user: User): void {
    const confirmed = confirm(`Permanently delete the account of ${user.displayName}?`);
    if (!confirmed) {
      return;
    }
    this.userService.deleteUser(user.id).subscribe({
      next: () => {
        this.users = this.users.filter(u => u.id !== user.id);
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The user could not be removed.');
      }
    });
  }

// Approves a group request: creates the group with the title,
// description and minimum age that were asked for, with the
// requester as its admin. The server makes the requester a member
// and a Group Admin as part of creating the group.
approveGroupRequest(req: GroupCreationRequest): void {
  const newGroup: Partial<Group> = {
    title: req.proposedTitle,
    description: req.proposedDescription,
    ageLimit: req.proposedAgeLimit || 0,
    adminIds: [req.requestedBy],
    channelIds: []
  };
  this.groupService.createGroup(newGroup).subscribe({
    next: (createdGroup) => {
      this.groups.push(createdGroup);
      this.showAsGroupAdmin(req.requestedBy, createdGroup.id);
      this.groupService.updateGroupRequest(req.id, 'approved').subscribe(() => {
        req.status = 'approved';
        this.cdr.markForCheck();
      });
    },
    error: (err) => {
      alert(err.error?.message || 'The group could not be created.');
    }
  });
}

rejectGroupRequest(req: GroupCreationRequest): void {
  const reason = prompt('Reason for rejecting this group request?');
  if (reason === null) {
    return;
  }
  this.groupService.updateGroupRequest(req.id, 'rejected', reason).subscribe(() => {
    req.status = 'rejected';
    req.rejectionReason = reason;
    this.cdr.markForCheck();
  });
}

  // Bans a user from the whole system. The ban is saved on their
  // account, so the server refuses their next login and their chat
  // messages. They stay in the list, marked banned, so the ban can
  // be seen and undone.
  banFromSystem(user: User): void {
    const confirmed = confirm(`Ban ${user.displayName} from the entire system?`);
    if (!confirmed) {
      return;
    }
    this.setSystemBan(user, true);
  }

  // Lifts a system ban so the user can log in again.
  unbanFromSystem(user: User): void {
    this.setSystemBan(user, false);
  }

  // Saves the ban flag on the server, then updates the row.
  private setSystemBan(user: User, isBanned: boolean): void {
    this.userService.updateUser(user.id, { isSystemBanned: isBanned }).subscribe({
      next: () => {
        user.isSystemBanned = isBanned;
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The ban could not be changed.');
      }
    });
  }
}