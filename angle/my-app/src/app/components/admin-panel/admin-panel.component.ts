import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { User } from '../../models/user.model';
import { Group } from '../../models/group.model';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-panel.component.html',
  styleUrl: './admin-panel.component.css'
})
export class AdminPanelComponent implements OnInit {
  users: User[] = [];

  // Groups stay mock data for now -- only Users are wired to the
  // backend for this Phase 1 slice, per the brief's "basic user
  // management" scope.
  groups: Group[] = [
    { id: 'g1', title: '2802ICT Study Group', description: 'Study group for 2802ICT students working through search algorithms and CSP.', ageLimit: 0, adminIds: ['u3'], channelIds: ['c1', 'c2'] },
    { id: 'g2', title: 'Casual Chat', description: 'General off-topic chat for classmates.', ageLimit: 0, adminIds: ['u3'], channelIds: ['c3'] }
  ];

  newUsername = '';
  newDisplayName = '';
  newGroupName = '';

  constructor(private userService: UserService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.userService.getUsers().subscribe(users => {
      this.users = users;
      this.cdr.markForCheck();
    });
  }

  requestNewUser(): void {
    if (!this.newUsername.trim()) {
      return;
    }
    const newUser: Partial<User> = {
      username: this.newUsername,
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
    });
  }

  createGroup(): void {
    if (!this.newGroupName.trim()) {
      return;
    }
    this.groups.push({
      id: 'g' + (this.groups.length + 1),
      title: this.newGroupName,
      description: '',
      ageLimit: 0,
      adminIds: [],
      channelIds: []
    });
    this.newGroupName = '';
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
}