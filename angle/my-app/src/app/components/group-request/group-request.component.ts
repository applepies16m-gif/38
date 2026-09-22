import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GroupCreationRequest } from '../../models/group.model';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-group-request',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './group-request.component.html',
  styleUrl: './group-request.component.css'
})
export class GroupRequestComponent implements OnInit {
 constructor(
  private router: Router,
  private authService: AuthService
) {}

ngOnInit(): void {
  const currentUser = this.authService.getCurrentUser();
  if (!currentUser) {
    this.router.navigate(['/login']);
    return;
  }

  if (currentUser.role === 'super_admin') {
    this.router.navigate(['/admin']);
  }
}

  proposedTitle = '';
  proposedDescription = '';
  submitted = false;

  // Mock: this user's own past requests, so they can see status.
  myRequests: GroupCreationRequest[] = [
    { id: 'gr1', requestedBy: 'me', proposedTitle: 'Board Games Club', proposedDescription: 'Weekly meetups to play board games on campus.', status: 'pending' }
  ];

  get titleCharsLeft(): number {
    return 30 - this.proposedTitle.length;
  }

  get descriptionCharsLeft(): number {
    return 250 - this.proposedDescription.length;
  }

  submitRequest(): void {
    if (!this.proposedTitle.trim() || !this.proposedDescription.trim()) {
      return;
    }
    // TODO Phase 2: POST /api/group-requests, notifies Super Admin
    this.myRequests.unshift({
      id: 'gr' + (this.myRequests.length + 1),
      requestedBy: 'me',
      proposedTitle: this.proposedTitle,
      proposedDescription: this.proposedDescription,
      status: 'pending'
    });
    this.proposedTitle = '';
    this.proposedDescription = '';
    this.submitted = true;
  }
}