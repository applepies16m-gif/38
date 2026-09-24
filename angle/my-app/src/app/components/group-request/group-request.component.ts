import { Component, OnInit } from '@angular/core';
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
  styleUrl: './group-request.component.css'
})
export class GroupRequestComponent implements OnInit {
 constructor(
  private router: Router,
  private authService: AuthService,
  private groupService: GroupService
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
 myRequests: GroupCreationRequest[] = [];

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
  const currentUser = this.authService.getCurrentUser();
  if (!currentUser) {
    return;
  }
  this.groupService.submitGroupRequest({
    requestedBy: currentUser.id,
    proposedTitle: this.proposedTitle,
    proposedDescription: this.proposedDescription
  }).subscribe(newRequest => {
    this.myRequests.unshift(newRequest);
    this.proposedTitle = '';
    this.proposedDescription = '';
    this.submitted = true;
  });
}
}