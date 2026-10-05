import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GroupCreationRequest } from '../../models/group.model';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-group-request',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './group-request.component.html',
  styleUrl: './group-request.component.css',
})
export class GroupRequestComponent implements OnInit {
  proposedTitle = '';
  proposedDescription = '';
  proposedAgeLimit: number | null = 0; // 0 = no minimum age; null while the box is empty
  submitted = false;
  errorMsg = '';

  // This user's own requests, newest first, so they can see each
  // one's status and any rejection reason.
  myRequests: GroupCreationRequest[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private groupService: GroupService,
    private cdr: ChangeDetectorRef,
  ) {}

  // Sends away anyone not logged in, and the Super Admin. Then loads
  // this user's earlier requests.
  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    if (currentUser.role === 'super_admin') {
      this.router.navigate(['/admin']);
      return;
    }

    // Read from the server, so earlier requests and their outcome
    // are still listed after a reload.
    this.groupService.getGroupRequests().subscribe((requests) => {
      this.myRequests = requests.filter((r) => r.requestedBy === currentUser.id).reverse();
      this.cdr.markForCheck();
    });
  }

  // How many more characters the title may have (the limit is 30).
  get titleCharsLeft(): number {
    return 30 - this.proposedTitle.length;
  }

  // How many more characters the description may have (the limit is
  // 250).
  get descriptionCharsLeft(): number {
    return 250 - this.proposedDescription.length;
  }

  // Sends the request to the Super Admin. The server checks the
  // title and description again and its message is shown if it
  // refuses.
  submitRequest(): void {
    this.submitted = false;
    this.errorMsg = '';
    if (!this.proposedTitle.trim() || !this.proposedDescription.trim()) {
      this.errorMsg = 'A title and a description are both required.';
      return;
    }
    const ageLimit = this.proposedAgeLimit;
    if (ageLimit === null || !Number.isInteger(ageLimit) || ageLimit < 0 || ageLimit > 120) {
      this.errorMsg = 'Minimum age must be a whole number from 0 to 120 (0 means no limit).';
      return;
    }
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return;
    }
    this.groupService
      .submitGroupRequest({
        requestedBy: currentUser.id,
        proposedTitle: this.proposedTitle,
        proposedDescription: this.proposedDescription,
        proposedAgeLimit: ageLimit,
      })
      .subscribe({
        next: (newRequest) => {
          this.myRequests.unshift(newRequest);
          this.proposedTitle = '';
          this.proposedDescription = '';
          this.proposedAgeLimit = 0;
          this.submitted = true;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMsg = err.error?.message || 'Your request could not be submitted.';
          this.cdr.markForCheck();
        },
      });
  }
}
