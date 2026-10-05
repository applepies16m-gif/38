import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {Router, RouterLink } from '@angular/router';
import { User } from '../../models/user.model';
import { Group, GroupCreationRequest } from '../../models/group.model';
import { UserService } from '../../services/user.service';
import { GroupService } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
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

  newUsername = '';
  newFirstName = '';
  newLastName = '';
  newEmail = '';
  newDisplayName = '';
  newPassword = '';
  newDateOfBirth = ''; // optional for accounts an admin creates
  newGroupName = '';

  constructor(
    private userService: UserService,
    private groupService: GroupService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private authService: AuthService
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

  createGroup(): void {
    if (!this.newGroupName.trim()) {
      return;
    }
    const newGroup: Partial<Group> = {
      title: this.newGroupName,
      description: '',
      ageLimit: 0,
      adminIds: [],
      channelIds: []
    };
    this.groupService.createGroup(newGroup).subscribe({
      next: (createdGroup) => {
        this.groups.push(createdGroup);
        this.newGroupName = '';
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

approveGroupRequest(req: GroupCreationRequest): void {
  const newGroup: Partial<Group> = {
    title: req.proposedTitle,
    description: req.proposedDescription,
    ageLimit: 0,
    adminIds: [req.requestedBy],
    channelIds: []
  };
  this.groupService.createGroup(newGroup).subscribe(createdGroup => {
    this.groups.push(createdGroup);

    // The requester becomes this group's admin -- both their role
    // and their group membership need updating, since the Group
    // Admin dashboard's route guard checks role specifically.
    const requester = this.users.find(u => u.id === req.requestedBy);
    const updatedGroupIds = requester
      ? [...requester.groupIds, createdGroup.id]
      : [createdGroup.id];

    this.userService.updateUser(req.requestedBy, {
      role: 'group_admin',
      groupIds: updatedGroupIds
    }).subscribe(() => {
      if (requester) {
        requester.role = 'group_admin';
        requester.groupIds = updatedGroupIds;
      }
      this.groupService.updateGroupRequest(req.id, 'approved').subscribe(() => {
        req.status = 'approved';
        this.cdr.markForCheck();
      });
    });
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