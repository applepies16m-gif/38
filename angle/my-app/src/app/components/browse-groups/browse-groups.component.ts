import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GroupService } from '../../services/group.service';
import { AuthService } from '../../services/auth.service';
import { Group } from '../../models/group.model';

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
  requestedGroupIds: string[] = [];
  errorMsg = '';

  constructor(
    private groupService: GroupService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.router.navigate(['/login']);
      return;
    }
    this.groupService.getGroups().subscribe(groups => {
      this.groups = groups;
    });
  }

  get filteredGroups(): Group[] {
    const term = this.searchTerm.toLowerCase();
    return this.groups.filter(g => g.title.toLowerCase().includes(term));
  }

  alreadyRequested(groupId: string): boolean {
    return this.requestedGroupIds.includes(groupId);
  }

  requestToJoin(group: Group): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return;
    }
    // Age-gating note: Group.ageLimit exists but enforcement against
    // User.dateOfBirth isn't wired up yet -- flagged as a known gap.
    this.groupService.submitJoinRequest({
      userId: currentUser.id,
      groupId: group.id
    }).subscribe({
      next: () => {
        this.requestedGroupIds.push(group.id);
      },
      error: () => {
        this.errorMsg = 'Something went wrong submitting your request.';
      }
    });
  }
}