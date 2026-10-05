import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GroupService } from '../../services/group.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { Group } from '../../models/group.model';
import { User } from '../../models/user.model';
import { calculateAge } from '../../utils/date-of-birth';

// What the page shows for one group: the button's text, whether it
// can be clicked, and the reason if it can't.
interface JoinStatus {
  label: string;
  canRequest: boolean;
  reason: string;
}

@Component({
  selector: 'app-browse-groups',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './browse-groups.component.html',
  styleUrl: './browse-groups.component.css'
})
export class BrowseGroupsComponent implements OnInit {
  groups: Group[] = [];
  searchTerm = '';
  currentUser: User | null = null;
  // Groups this user has a pending request for. Read from the
  // server, so "Requested" survives a page reload.
  pendingGroupIds: string[] = [];
  errorMsg = '';

  constructor(
    private groupService: GroupService,
    private userService: UserService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const savedUser = this.authService.getCurrentUser();
    if (!savedUser) {
      this.router.navigate(['/login']);
      return;
    }
    // Start from the copy saved at login; it is replaced below
    // with the server's current one.
    this.currentUser = savedUser;

    this.groupService.getGroups().subscribe(groups => {
      this.groups = groups;
      this.cdr.markForCheck();
    });

    // Bans and memberships may have changed since login, and the
    // button states depend on them, so re-read the user.
    this.userService.getUsers().subscribe(users => {
      const freshUser = users.find(u => u.id === savedUser.id);
      if (!freshUser) {
        // The account no longer exists, so end the session.
        this.authService.logout();
        this.router.navigate(['/login']);
        return;
      }
      this.authService.login(freshUser);
      this.currentUser = freshUser;
      this.cdr.markForCheck();
    });

    this.groupService.getJoinRequests().subscribe(requests => {
      this.pendingGroupIds = requests
        .filter(r => r.userId === savedUser.id && r.status === 'pending')
        .map(r => r.groupId);
      this.cdr.markForCheck();
    });
  }

  get filteredGroups(): Group[] {
    const term = this.searchTerm.toLowerCase();
    return this.groups.filter(g => g.title.toLowerCase().includes(term));
  }

  // Works out what to show for one group. These are the same rules
  // the server applies in checkJoinAllowed; the server still has
  // the final say when the request is sent.
  joinStatus(group: Group): JoinStatus {
    const user = this.currentUser;
    if (!user) {
      return { label: 'Request to Join', canRequest: false, reason: '' };
    }
    if (user.isSystemBanned) {
      return { label: 'Banned', canRequest: false, reason: 'Your account has been banned from the system.' };
    }
    if ((user.bannedFromGroupIds || []).includes(group.id)) {
      return { label: 'Banned', canRequest: false, reason: 'You have been banned from this group.' };
    }
    if ((user.groupIds || []).includes(group.id)) {
      return { label: 'Member', canRequest: false, reason: '' };
    }
    if (this.pendingGroupIds.includes(group.id)) {
      return { label: 'Requested', canRequest: false, reason: '' };
    }
    if (group.ageLimit > 0) {
      const age = calculateAge(user.dateOfBirth);
      if (age === null) {
        return { label: 'Request to Join', canRequest: false, reason: 'Your account has no valid date of birth, so your age can\'t be checked. Add it on your profile.' };
      }
      if (age < group.ageLimit) {
        return { label: 'Request to Join', canRequest: false, reason: `You must be ${group.ageLimit} or older to join.` };
      }
    }
    return { label: 'Request to Join', canRequest: true, reason: '' };
  }

  // Sends a join request. The server re-checks every rule and its
  // message is shown if it refuses.
  requestToJoin(group: Group): void {
    if (!this.currentUser) {
      return;
    }
    this.errorMsg = '';
    this.groupService.submitJoinRequest({
      userId: this.currentUser.id,
      groupId: group.id
    }).subscribe({
      next: () => {
        this.pendingGroupIds.push(group.id);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Something went wrong submitting your request.';
        this.cdr.markForCheck();
      }
    });
  }
}
