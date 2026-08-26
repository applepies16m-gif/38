import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { User } from '../../models/user.model';
import { Group, GroupCreationRequest } from '../../models/group.model';
import { UserService } from '../../services/user.service';
import { GroupService } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';

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

  groupRequests: GroupCreationRequest[] = [
    { id: 'gr1', requestedBy: 'me', proposedTitle: 'Board Games Club', proposedDescription: 'Weekly meetups to play board games on campus.', status: 'pending' }
  ];

  newUsername = '';
  newDisplayName = '';
  newPassword = '';
  newGroupName = '';

  constructor(
    private userService: UserService,
    private groupService: GroupService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    const role = this.route.snapshot.queryParams['role'];
    if (role !== 'super_admin') {
      this.router.navigate(['/chat'], { queryParams: this.route.snapshot.queryParams });
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
  }

  requestNewUser(): void {
    if (!this.newUsername.trim() || !this.newPassword.trim()) {
      return;
    }
    if (this.newPassword.length < 8 || !/[A-Z]/.test(this.newPassword)) {
      alert('Password must be at least 8 characters and include an uppercase letter.');
      return;
    }
    const newUser: Partial<User> = {
      username: this.newUsername,
      password: this.newPassword,
      displayName: this.newDisplayName || this.newUsername,
      email: this.newUsername + '@student.griffith.edu.au',
      role: 'user',
      online: false,
      groupIds: [],
      bannedFromGroupIds: [],
      isSystemBanned: false
    };
    this.userService.createUser(newUser).subscribe(createdUser => {
      this.users.push(createdUser);
      this.cdr.markForCheck();
      this.newUsername = '';
      this.newDisplayName = '';
      this.newPassword = '';
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
    this.groupService.createGroup(newGroup).subscribe(createdGroup => {
      this.groups.push(createdGroup);
      this.cdr.markForCheck();
      this.newGroupName = '';
    });
  }

  groupNames(user: User): string {
    return user.groupIds
      .map(id => this.groups.find(g => g.id === id)?.title)
      .filter(Boolean)
      .join(', ') || '--';
  }

  removeUser(user: User): void {
    this.userService.deleteUser(user.id).subscribe(() => {
      this.users = this.users.filter(u => u.id !== user.id);
      this.cdr.markForCheck();
    });
  }

  approveGroupRequest(req: GroupCreationRequest): void {
    req.status = 'approved';
    const newGroup: Partial<Group> = {
      title: req.proposedTitle,
      description: req.proposedDescription,
      ageLimit: 0,
      adminIds: [req.requestedBy],
      channelIds: []
    };
    this.groupService.createGroup(newGroup).subscribe(createdGroup => {
      this.groups.push(createdGroup);
      this.cdr.markForCheck();
    });
  }

  rejectGroupRequest(req: GroupCreationRequest): void {
    const reason = prompt('Reason for rejecting this group request?');
    if (reason === null) {
      return;
    }
    req.status = 'rejected';
    req.rejectionReason = reason;
  }

  banFromSystem(user: User): void {
    const confirmed = confirm(`Permanently ban ${user.displayName} from the entire system?`);
    if (!confirmed) {
      return;
    }
    user.isSystemBanned = true;
    this.users = this.users.filter(u => u.id !== user.id);
  }
}