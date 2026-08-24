import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { User } from '../../models/user.model';
import { Group, JoinRequest, RoomRequest } from '../../models/group.model';

@Component({
  selector: 'app-group-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './group-admin.component.html',
  styleUrl: './group-admin.component.css'
})
export class GroupAdminComponent {
  // Mock: this admin manages g1 only, for the prototype.
  group: Group = {
    id: 'g1',
    title: '2802ICT Study Group',
    description: 'Study group for 2802ICT students working through search algorithms and CSP.',
    ageLimit: 0,
    adminIds: ['u3'],
    channelIds: ['c1', 'c2']
  };

  members: User[] = [
    { id: 'u1', username: 'anthony', displayName: 'Anthony', email: 'anthony@student.griffith.edu.au', role: 'user', online: true, groupIds: ['g1', 'g2'], bannedFromGroupIds: [], isSystemBanned: false },
    { id: 'u2', username: 'maria', displayName: 'Maria', email: 'maria@student.griffith.edu.au', role: 'user', online: true, groupIds: ['g1'], bannedFromGroupIds: [], isSystemBanned: false }
  ];

  joinRequests: JoinRequest[] = [
    { id: 'jr1', userId: 'u4', groupId: 'g1', status: 'pending' },
    { id: 'jr2', userId: 'u5', groupId: 'g1', status: 'pending' }
  ];

  roomRequests: RoomRequest[] = [
    { id: 'rr1', requestedBy: 'u1', groupId: 'g1', roomName: 'exam-prep', status: 'pending' }
  ];

  // Just for displaying a name against a join/room request's userId,
  // since real users aren't loaded from a service yet.
  requesterNames: Record<string, string> = {
    u4: 'Jordan',
    u5: 'Priya'
  };

  approveJoinRequest(req: JoinRequest): void {
    req.status = 'approved';
    this.members.push({
      id: req.userId,
      username: this.requesterNames[req.userId] || req.userId,
      displayName: this.requesterNames[req.userId] || req.userId,
      email: '',
      role: 'user',
      online: false,
      groupIds: [this.group.id],
      bannedFromGroupIds: [],
      isSystemBanned: false
    });
  }

  rejectJoinRequest(req: JoinRequest): void {
    const reason = prompt('Reason for rejecting this join request?');
    if (reason === null) {
      return;
    }
    req.status = 'rejected';
    req.rejectionReason = reason;
  }

  approveRoomRequest(req: RoomRequest): void {
    req.status = 'approved';
    this.group.channelIds.push('c' + (this.group.channelIds.length + 10));
  }

  rejectRoomRequest(req: RoomRequest): void {
    const reason = prompt('Reason for rejecting this room request?');
    if (reason === null) {
      return;
    }
    req.status = 'rejected';
    req.rejectionReason = reason;
  }

  promoteToAdmin(member: User): void {
    if (!this.group.adminIds.includes(member.id)) {
      this.group.adminIds.push(member.id);
    }
  }

  demoteAdmin(member: User): void {
    if (this.group.adminIds.length <= 1) {
      alert('A group must always have at least one admin.');
      return;
    }
    this.group.adminIds = this.group.adminIds.filter(id => id !== member.id);
  }

  banMember(member: User): void {
    member.bannedFromGroupIds.push(this.group.id);
    this.members = this.members.filter(m => m.id !== member.id);
  }

  isAdmin(member: User): boolean {
    return this.group.adminIds.includes(member.id);
  }

  saveGroupSettings(): void {
    // TODO Phase 2: PUT /api/groups/:id
    alert('Group settings saved (mock).');
  }
}
