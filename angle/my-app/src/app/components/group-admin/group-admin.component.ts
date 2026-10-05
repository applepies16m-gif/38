import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { User } from '../../models/user.model';
import { Group, JoinRequest, RoomRequest, BanRequest } from '../../models/group.model';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';
import { UserService } from '../../services/user.service';
import { ChannelService } from '../../services/channel.service';

@Component({
  selector: 'app-group-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './group-admin.component.html',
  styleUrl: './group-admin.component.css'
})
export class GroupAdminComponent implements OnInit {
  currentUserId = '';
  allGroups: Group[] = [];
  allUsers: User[] = [];
  selectedGroupId = '';
  newChannelName = '';


  roomRequests: RoomRequest[] = [];
  banRequests: BanRequest[] = [];

  joinRequests: JoinRequest[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private groupService: GroupService,
    private userService: UserService,
    private channelService: ChannelService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.router.navigate(['/login']);
      return;
    }
    if (currentUser.role !== 'group_admin' && currentUser.role !== 'super_admin') {
      this.router.navigate(['/chat']);
      return;
    }
    this.currentUserId = currentUser.id;

    this.groupService.getGroups().subscribe(groups => {
      this.allGroups = groups;
      if (this.myGroups.length > 0) {
        this.selectedGroupId = this.myGroups[0].id;
      }
      this.cdr.markForCheck();
    });
    this.groupService.getRoomRequests().subscribe(requests => {
  this.roomRequests = requests;
  this.cdr.markForCheck();
});

this.groupService.getBanRequests().subscribe(requests => {
  this.banRequests = requests;
  this.cdr.markForCheck();
});

    this.userService.getUsers().subscribe(users => {
      this.allUsers = users;
      this.cdr.markForCheck();
    });

    this.groupService.getJoinRequests().subscribe(requests => {
      this.joinRequests = requests;
      this.cdr.markForCheck();
    });
  }

  get myGroups(): Group[] {
    return this.allGroups.filter(g => g.adminIds.includes(this.currentUserId));
  }

  get selectedGroup(): Group | undefined {
    return this.allGroups.find(g => g.id === this.selectedGroupId);
  }

  get members(): User[] {
    return this.allUsers.filter(u => u.groupIds.includes(this.selectedGroupId));
  }

  get pendingJoinRequestsForGroup(): JoinRequest[] {
    return this.joinRequests.filter(r => r.groupId === this.selectedGroupId && r.status === 'pending');
  }
  get pendingRoomRequestsForGroup(): RoomRequest[] {
  return this.roomRequests.filter(r => r.groupId === this.selectedGroupId && r.status === 'pending');
}

get pendingBanRequestsForGroup(): BanRequest[] {
  return this.banRequests.filter(r => r.groupId === this.selectedGroupId && r.status === 'pending');
}

  selectGroup(groupId: string): void {
    this.selectedGroupId = groupId;
  }

  requesterName(userId: string): string {
    return this.allUsers.find(u => u.id === userId)?.displayName || userId;
  }

  // Approves a join request. The server checks the join rules
  // again (ban, age limit, already a member); if the request no
  // longer passes, the server has already marked it rejected, so
  // show the admin why and update the row to match.
  approveJoinRequest(req: JoinRequest): void {
    this.groupService.updateJoinRequest(req.id, 'approved').subscribe({
      next: () => {
        req.status = 'approved';
        const user = this.allUsers.find(u => u.id === req.userId);
        if (user && !user.groupIds.includes(req.groupId)) {
          user.groupIds.push(req.groupId);
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        const reason = err.error?.message || 'The request could not be approved.';
        req.status = 'rejected';
        req.rejectionReason = reason;
        alert(`This request can't be approved and has been rejected: ${reason}`);
        this.cdr.markForCheck();
      }
    });
  }

  rejectJoinRequest(req: JoinRequest): void {
    const reason = prompt('Reason for rejecting this join request?');
    if (reason === null) {
      return;
    }
    this.groupService.updateJoinRequest(req.id, 'rejected', reason).subscribe(() => {
      req.status = 'rejected';
      req.rejectionReason = reason;
      this.cdr.markForCheck();
    });
  }

 approveRoomRequest(req: RoomRequest): void {
  this.groupService.updateRoomRequest(req.id, 'approved').subscribe(() => {
    req.status = 'approved';
    this.cdr.markForCheck();
  });
}

rejectRoomRequest(req: RoomRequest): void {
  const reason = prompt('Reason for rejecting this room request?');
  if (reason === null) {
    return;
  }
  this.groupService.updateRoomRequest(req.id, 'rejected', reason).subscribe(() => {
    req.status = 'rejected';
    req.rejectionReason = reason;
    this.cdr.markForCheck();
  });
}

approveBanRequest(req: BanRequest): void {
  this.groupService.updateBanRequest(req.id, 'approved').subscribe(() => {
    req.status = 'approved';
    // Reflect the ban locally too, so the Members table updates
    // immediately without waiting for a full page reload.
    const target = this.allUsers.find(u => u.id === req.targetUserId);
    if (target) {
      target.groupIds = target.groupIds.filter(id => id !== req.groupId);
      target.bannedFromGroupIds = [...target.bannedFromGroupIds, req.groupId];
    }
    this.cdr.markForCheck();
  });
}

rejectBanRequest(req: BanRequest): void {
  const reason = prompt('Reason for rejecting this ban request?');
  if (reason === null) {
    return;
  }
  this.groupService.updateBanRequest(req.id, 'rejected', reason).subscribe(() => {
    req.status = 'rejected';
    req.rejectionReason = reason;
    this.cdr.markForCheck();
  });
}

  isAdmin(member: User): boolean {
    return this.selectedGroup?.adminIds.includes(member.id) || false;
  }

  promoteToAdmin(member: User): void {
    const group = this.selectedGroup;
    if (!group || group.adminIds.includes(member.id)) {
      return;
    }
    const updatedAdminIds = [...group.adminIds, member.id];
    this.groupService.updateGroup(group.id, { adminIds: updatedAdminIds }).subscribe(() => {
      group.adminIds = updatedAdminIds;
      if (member.role === 'user') {
        this.userService.updateUser(member.id, { role: 'group_admin' }).subscribe(() => {
          member.role = 'group_admin';
          this.cdr.markForCheck();
        });
      }
    });
  }

  demoteAdmin(member: User): void {
    const group = this.selectedGroup;
    if (!group) {
      return;
    }
    if (group.adminIds.length <= 1) {
      alert('A group must always have at least one admin.');
      return;
    }
    const updatedAdminIds = group.adminIds.filter(id => id !== member.id);
    this.groupService.updateGroup(group.id, { adminIds: updatedAdminIds }).subscribe(() => {
      group.adminIds = updatedAdminIds;

      // Only downgrade their account role to plain "user" if they
      // are not still an admin of some other group.
      const stillAdminElsewhere = this.allGroups.some(g =>
        g.id !== group.id && g.adminIds.includes(member.id)
      );
      if (!stillAdminElsewhere && member.role === 'group_admin') {
        this.userService.updateUser(member.id, { role: 'user' }).subscribe(() => {
          member.role = 'user';
          this.cdr.markForCheck();
        });
      } else {
        this.cdr.markForCheck();
      }
    });
  }

  banMember(member: User): void {
    const group = this.selectedGroup;
    if (!group) {
      return;
    }
    const confirmed = confirm(`Ban ${member.displayName} from ${group.title}?`);
    if (!confirmed) {
      return;
    }
    const updatedGroupIds = member.groupIds.filter(id => id !== group.id);
    const updatedBannedIds = [...member.bannedFromGroupIds, group.id];
    this.userService.updateUser(member.id, {
      groupIds: updatedGroupIds,
      bannedFromGroupIds: updatedBannedIds
    }).subscribe(() => {
      member.groupIds = updatedGroupIds;
      member.bannedFromGroupIds = updatedBannedIds;
      this.cdr.markForCheck();
    });
  }

  saveGroupSettings(): void {
    const group = this.selectedGroup;
    if (!group) {
      return;
    }
    this.groupService.updateGroup(group.id, {
      title: group.title,
      description: group.description,
      ageLimit: group.ageLimit
    }).subscribe(() => {
      alert('Group settings saved.');
    });
  }
  createChannel(): void {
  const group = this.selectedGroup;
  if (!group || !this.newChannelName.trim()) {
    return;
  }
  this.channelService.createChannel({
    name: this.newChannelName,
    groupId: group.id
  }).subscribe(() => {
    this.newChannelName = '';
    alert('Channel created.');
  });
}
}