import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { User } from '../../models/user.model';
import { Group, Channel, JoinRequest, RoomRequest, BanRequest } from '../../models/group.model';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';
import { UserService } from '../../services/user.service';
import { ChannelService } from '../../services/channel.service';
import { ReportService } from '../../services/report.service';
import { Report } from '../../models/report.model';

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
    private reportService: ReportService,
    private cdr: ChangeDetectorRef
  ) {}

  // Reports made by members. A Group Admin can read the ones from
  // their group; the Super Admin decides them in the Admin Panel.
  reports: Report[] = [];

  get reportsForGroup(): Report[] {
    return this.reports.filter(r => r.groupId === this.selectedGroupId);
  }

  // Every channel, and the ones belonging to the selected group.
  allChannels: Channel[] = [];

  get channelsForGroup(): Channel[] {
    return this.allChannels.filter(c => c.groupId === this.selectedGroupId);
  }

  // Deletes a channel and everything in it. The server refuses if
  // it is the group's last channel, and tells open chat pages so
  // the channel disappears for everyone.
  deleteChannel(channel: Channel): void {
    if (!confirm(`Delete the channel "${channel.name}" and all its messages? This cannot be undone.`)) {
      return;
    }
    this.channelService.deleteChannel(channel.id).subscribe({
      next: () => {
        this.allChannels = this.allChannels.filter(c => c.id !== channel.id);
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The channel could not be deleted.');
      }
    });
  }

  // Removes the group's colour theme (saved with Save Settings).
  clearTheme(): void {
    if (this.selectedGroup) {
      this.selectedGroup.theme = '';
    }
  }

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

    this.reportService.getReports().subscribe(reports => {
      this.reports = reports;
      this.cdr.markForCheck();
    });

    this.channelService.getChannels().subscribe(channels => {
      this.allChannels = channels;
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

// Pending remove/ban requests this group's admins decide. Requests
// about a Group Admin are left out: the Super Admin decides those.
get pendingBanRequestsForGroup(): BanRequest[] {
  return this.banRequests.filter(r =>
    r.groupId === this.selectedGroupId && r.status === 'pending' && r.reviewer !== 'super_admin');
}

// This admin's own pending requests about other admins of the
// group, shown so they can see the Super Admin has not decided yet.
get myAdminRemovalRequests(): BanRequest[] {
  return this.banRequests.filter(r =>
    r.groupId === this.selectedGroupId && r.status === 'pending' &&
    r.reviewer === 'super_admin' && r.requestedBy === this.currentUserId);
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

// Approves a member's request to remove or ban someone. The server
// carries it out; this then updates the copy held by the page so
// the Members table is right without a reload.
approveBanRequest(req: BanRequest): void {
  this.groupService.updateBanRequest(req.id, 'approved').subscribe({
    next: () => {
      req.status = 'approved';
      const target = this.allUsers.find(u => u.id === req.targetUserId);
      if (target) {
        target.groupIds = target.groupIds.filter(id => id !== req.groupId);
        if (req.action !== 'remove') {
          target.bannedFromGroupIds = [...target.bannedFromGroupIds, req.groupId];
        }
      }
      this.cdr.markForCheck();
    },
    error: (err) => {
      alert(err.error?.message || 'The request could not be approved.');
    }
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

  // Bans an ordinary member from the group straight away. A Group
  // Admin can't be banned like this; the server refuses and
  // requestAdminRemoval is used instead.
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
    }).subscribe({
      next: () => {
        member.groupIds = updatedGroupIds;
        member.bannedFromGroupIds = updatedBannedIds;
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The member could not be banned.');
      }
    });
  }

  // Asks the Super Admin to remove or ban another admin of this
  // group. One Group Admin can't do that to another directly; it
  // has to be requested with a reason and reviewed.
  requestAdminRemoval(member: User, action: 'remove' | 'ban'): void {
    const group = this.selectedGroup;
    if (!group) {
      return;
    }
    const reason = prompt(`Why should ${member.displayName} be ${action === 'ban' ? 'banned from' : 'removed from'} ${group.title}? This goes to the Super Admin.`);
    if (reason === null) {
      return;
    }
    this.groupService.submitBanRequest({
      requestedBy: this.currentUserId,
      targetUserId: member.id,
      groupId: group.id,
      action,
      reason
    }).subscribe({
      next: (newRequest) => {
        this.banRequests = [...this.banRequests, newRequest];
        alert('Your request has been sent to the Super Admin.');
        this.cdr.markForCheck();
      },
      error: (err) => {
        alert(err.error?.message || 'The request could not be sent.');
      }
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
      ageLimit: group.ageLimit,
      theme: group.theme || ''
    }).subscribe({
      next: () => {
        alert('Group settings saved.');
      },
      // The server checks the title, description and age limit and
      // says which one is wrong.
      error: (err) => {
        alert(err.error?.message || 'The group settings could not be saved.');
      }
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
  }).subscribe({
    next: (createdChannel) => {
      this.allChannels = [...this.allChannels, createdChannel];
      this.newChannelName = '';
      alert('Channel created.');
      this.cdr.markForCheck();
    },
    error: (err) => {
      alert(err.error?.message || 'The channel could not be created.');
    }
  });
}
}