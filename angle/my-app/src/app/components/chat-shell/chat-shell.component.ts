import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Group, Channel } from '../../models/group.model';
import { User } from '../../models/user.model';
import { ChatMessage, SystemMessage } from '../../models/message.model';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-chat-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './chat-shell.component.html',
  styleUrl: './chat-shell.component.css'
})
export class ChatShellComponent implements OnInit {
  currentUsername = '';
  currentRole: 'super_admin' | 'group_admin' | 'user' = 'user';

groups: Group[] = [
  { id: 'g1', title: '2802ICT Study Group', description: 'Study group for 2802ICT students working through search algorithms and CSP.', ageLimit: 0, adminIds: ['u3'], channelIds: ['c1', 'c2'] },
  { id: 'g2', title: 'Casual Chat', description: 'General off-topic chat for classmates.', ageLimit: 0, adminIds: ['u3'], channelIds: ['c3'] }
];

  channels: Channel[] = [
    { id: 'c1', name: 'general', groupId: 'g1' },
    { id: 'c2', name: 'assignment-help', groupId: 'g1' },
    { id: 'c3', name: 'random', groupId: 'g2' }
  ];

 onlineUsers: User[] = [
  { id: 'u1', username: 'anthony', displayName: 'Anthony', email: 'anthony@student.griffith.edu.au', role: 'user', online: true, groupIds: ['g1', 'g2'], bannedFromGroupIds: [], isSystemBanned: false },
  { id: 'u2', username: 'maria', displayName: 'Maria', email: 'maria@student.griffith.edu.au', role: 'user', online: true, groupIds: ['g1'], bannedFromGroupIds: [], isSystemBanned: false },
  { id: 'u3', username: 'admin', displayName: 'Admin', email: 'admin@griffith.edu.au', role: 'super_admin', online: false, groupIds: [], bannedFromGroupIds: [], isSystemBanned: false }
];

  messages: ChatMessage[] = [
    { id: 'm1', channelId: 'c1', senderId: 'u2', senderName: 'Maria', text: 'has anyone started the maze solver yet?', timestamp: '10:02 AM' },
    { id: 'm2', channelId: 'c1', senderId: 'u1', senderName: 'Anthony', text: 'yeah, working on IDA* right now', timestamp: '10:04 AM' }
  ];
  systemMessages: SystemMessage[] = [
  { id: 's1', channelId: 'c1', type: 'join', username: 'Maria', timestamp: '10:01 AM' },
  { id: 's2', channelId: 'c1', type: 'join', username: 'Anthony', timestamp: '10:03 AM' }
];

  activeChannelId = 'c1';
  draftMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  hasGroups = true;

ngOnInit(): void {
  if (!this.authService.isLoggedIn()) {
    this.router.navigate(['/login']);
    return;
  }

  const role = this.route.snapshot.queryParams['role'];
  if (role === 'super_admin') {
    this.router.navigate(['/admin'], { queryParams: this.route.snapshot.queryParams });
    return;
  }

  this.route.queryParams.subscribe(params => {
    this.currentUsername = params['user'] || 'guest';
    this.currentRole = params['role'] || 'user';
    this.hasGroups = params['hasGroups'] !== 'false';
  });
}
  get activeChannel(): Channel | undefined {
    return this.channels.find(c => c.id === this.activeChannelId);
  }

 get threadItems(): (ChatMessage | SystemMessage)[] {
  const chatItems = this.messages.filter(m => m.channelId === this.activeChannelId);
  const systemItems = this.systemMessages.filter(s => s.channelId === this.activeChannelId);
  return [...chatItems, ...systemItems].sort((a, b) => a.id.localeCompare(b.id));
}

isSystemMessage(item: ChatMessage | SystemMessage): item is SystemMessage {
  return 'type' in item;
}

  channelsForGroup(groupId: string): Channel[] {
    return this.channels.filter(c => c.groupId === groupId);
  }

  selectChannel(channelId: string): void {
    this.activeChannelId = channelId;
  }

  sendMessage(): void {
    if (!this.draftMessage.trim()) {
      return;
    }
    this.messages.push({
      id: 'm' + (this.messages.length + 1),
      channelId: this.activeChannelId,
      senderId: 'me',
      senderName: this.currentUsername,
      text: this.draftMessage,
      timestamp: 'Just now'
    });
    this.draftMessage = '';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
    requestToJoin(): void {
    // Phase 1 stub — real join-request flow (browse groups, submit
    // request, Group Admin approval) lands in Phase 2.
    alert('Join request sent (mock) — a Group Admin will review it in Phase 2.');
  }
}
