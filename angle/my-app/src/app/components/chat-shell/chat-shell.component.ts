import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Group, Channel } from '../../models/group.model';
import { User } from '../../models/user.model';
import { ChatMessage, SystemMessage } from '../../models/message.model';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { GroupService } from '../../services/group.service';
import { ChannelService } from '../../services/channel.service';
import { UserService } from '../../services/user.service';
import { MessageService } from '../../services/message.service';

@Component({
  selector: 'app-chat-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './chat-shell.component.html',
  styleUrl: './chat-shell.component.css'
})
export class ChatShellComponent implements OnInit, OnDestroy {
  currentUsername = '';
  currentUserId = '';
  currentRole: 'super_admin' | 'group_admin' | 'user' = 'user';
  hasGroups = true;

  allGroups: Group[] = [];
  // Every group on the server, and the ids of the ones this user
  // belongs to. allGroups is worked out from these two.
  private everyGroup: Group[] = [];
  private myGroupIds: string[] = [];
  allChannels: Channel[] = [];
  onlineUsers: User[] = [];

  activeGroupId = '';
  activeChannelId = '';

  messages: ChatMessage[] = [];
  systemMessages: SystemMessage[] = [];
  draftMessage = '';

  constructor(
    private router: Router,
    private authService: AuthService,
    private socketService: SocketService,
    private groupService: GroupService,
    private channelService: ChannelService,
    private userService: UserService,
    private messageService: MessageService,
    private cdr: ChangeDetectorRef
  ) {}

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

    this.currentUsername = currentUser.displayName || currentUser.username;
    this.currentUserId = currentUser.id;
    this.currentRole = currentUser.role;
    // Start from the copy saved at login so the page draws straight
    // away; it is corrected below once the server answers.
    this.myGroupIds = currentUser.groupIds;
    this.applyMembership();

    this.groupService.getGroups().subscribe(groups => {
      this.everyGroup = groups;
      this.applyMembership();
    });

    this.channelService.getChannels().subscribe(channels => {
      this.allChannels = channels;
      this.cdr.markForCheck();
    });

    this.userService.getUsers().subscribe(users => {
      this.onlineUsers = users;

      // The copy in localStorage dates from login. Bans, approvals
      // and promotions since then only exist on the server, so
      // replace the saved copy with the server's current one.
      const freshUser = users.find(u => u.id === currentUser.id);
      if (!freshUser) {
        // The account no longer exists, so end the session.
        this.logout();
        return;
      }
      this.authService.login(freshUser);
      this.currentUsername = freshUser.displayName || freshUser.username;
      this.currentRole = freshUser.role;
      this.myGroupIds = freshUser.groupIds;
      this.applyMembership();
    });

    this.socketService.getSocket().on('newMessage', (message: ChatMessage) => {
      this.messages.push(message);
      this.cdr.markForCheck();
    });

    this.socketService.getSocket().on('userJoined', (data: { channelId: string; username: string; timestamp: string }) => {
      this.systemMessages.push({
        id: 's' + Date.now(),
        channelId: data.channelId,
        type: 'join',
        username: data.username,
        timestamp: data.timestamp
      });
      this.cdr.markForCheck();
    });

    this.socketService.getSocket().on('userLeft', (data: { channelId: string; username: string; timestamp: string }) => {
      this.systemMessages.push({
        id: 's' + Date.now(),
        channelId: data.channelId,
        type: 'leave',
        username: data.username,
        timestamp: data.timestamp
      });
      this.cdr.markForCheck();
    });
  }

  // Works out which groups to show: only the ones this user
  // currently belongs to. Called whenever the group list or the
  // user's membership changes.
  private applyMembership(): void {
    this.allGroups = this.everyGroup.filter(g => this.myGroupIds.includes(g.id));
    this.hasGroups = this.myGroupIds.length > 0;
    this.cdr.markForCheck();
  }

  // The socket is shared and outlives this component, so the
  // listeners added in ngOnInit must be removed here. Otherwise
  // each return to the chat page adds another set and every
  // message shows up more than once.
  ngOnDestroy(): void {
    const socket = this.socketService.getSocket();
    socket.off('newMessage');
    socket.off('userJoined');
    socket.off('userLeft');

    if (this.activeChannelId) {
      socket.emit('leaveChannel', {
        channelId: this.activeChannelId,
        username: this.currentUsername
      });
    }
  }

  channelsForGroup(groupId: string): Channel[] {
    return this.allChannels.filter(c => c.groupId === groupId);
  }

  get activeChannel(): Channel | undefined {
    return this.allChannels.find(c => c.id === this.activeChannelId);
  }

  get threadItems(): (ChatMessage | SystemMessage)[] {
    const chatItems = this.messages.filter(m => m.channelId === this.activeChannelId);
    const systemItems = this.systemMessages.filter(s => s.channelId === this.activeChannelId);
    return [...chatItems, ...systemItems].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  isSystemMessage(item: ChatMessage | SystemMessage): item is SystemMessage {
    return 'type' in item;
  }

  selectChannel(channelId: string): void {
    if (this.activeChannelId) {
      this.socketService.getSocket().emit('leaveChannel', {
        channelId: this.activeChannelId,
        username: this.currentUsername
      });
    }

    this.activeChannelId = channelId;
    this.messages = [];
    this.systemMessages = [];

    this.socketService.getSocket().emit('joinChannel', {
      channelId: this.activeChannelId,
      username: this.currentUsername
    });

    this.messageService.getRecentMessages(channelId).subscribe(history => {
      // Ignore a late response if the user already switched channels.
      if (this.activeChannelId !== channelId) {
        return;
      }
      // Merge rather than overwrite, so a message that arrived live
      // while the history request was in flight isn't lost or doubled.
      const liveOnly = this.messages.filter(m => !history.some(h => h.id === m.id));
      this.messages = [...history, ...liveOnly];
      this.cdr.markForCheck();
    });
  }

  sendMessage(): void {
    if (!this.draftMessage.trim() || !this.activeChannelId) {
      return;
    }
    this.socketService.getSocket().emit('sendMessage', {
      channelId: this.activeChannelId,
      senderId: this.currentUserId,
      senderName: this.currentUsername,
      text: this.draftMessage,
      // ISO format, the same as the server's join/leave notices, so
      // threadItems can sort both kinds together correctly.
      timestamp: new Date().toISOString()
    });
    this.draftMessage = '';
  }

  // Converts a stored timestamp into a short time for display,
  // e.g. "01:47 PM". Older messages were saved already formatted
  // and can't be parsed as a date, so those are shown unchanged.
  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return timestamp;
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}