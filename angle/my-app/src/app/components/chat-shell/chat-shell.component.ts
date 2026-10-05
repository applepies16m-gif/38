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
import { UploadService } from '../../services/upload.service';
import { ReportService } from '../../services/report.service';
import { NotificationService } from '../../services/notification.service';

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
  // Users this person has blocked; read from the server on load.
  blockedUserIds: string[] = [];
  // How many notifications from the Super Admin are unread.
  unreadNotifications = 0;
  allChannels: Channel[] = [];
  // Every user, and the ids of those online right now. The ids
  // start from the server's list and are then kept up to date by
  // the presenceChanged socket event.
  allUsers: User[] = [];
  private onlineUserIds = new Set<string>();

  activeGroupId = '';
  activeChannelId = '';

  messages: ChatMessage[] = [];
  systemMessages: SystemMessage[] = [];
  draftMessage = '';
  // Shown in the thread when the server refuses a join or message.
  channelNotice = '';

  // The image chosen for the next message (not uploaded until Send),
  // any problem with it, and whether a send is in progress.
  pendingImage: File | null = null;
  imageError = '';
  isSending = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private socketService: SocketService,
    private groupService: GroupService,
    private channelService: ChannelService,
    private userService: UserService,
    private messageService: MessageService,
    private uploadService: UploadService,
    private reportService: ReportService,
    private notificationService: NotificationService,
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

    this.refreshCurrentUser();

    // Tell the server which user this tab belongs to, so it counts
    // as one of their connections for "Online Now". 'connect' also
    // fires if the connection drops and comes back, when the server
    // has forgotten this tab and needs telling again.
    this.announcePresence();
    this.socketService.getSocket().on('connect', () => {
      this.announcePresence();
      if (this.activeChannelId) {
        this.socketService.getSocket().emit('joinChannel', {
          channelId: this.activeChannelId,
          userId: this.currentUserId,
          username: this.currentUsername
        });
      }
    });

    // Someone came online or went offline.
    this.socketService.getSocket().on('presenceChanged', (data: { userId: string; online: boolean }) => {
      if (data.online) {
        this.onlineUserIds.add(data.userId);
      } else {
        this.onlineUserIds.delete(data.userId);
      }
      this.cdr.markForCheck();
    });

    // The Super Admin sent a notification that this user can read.
    this.socketService.getSocket().on('notification', () => {
      this.unreadNotifications = this.unreadNotifications + 1;
      this.cdr.markForCheck();
    });

    // A Group Admin deleted a channel: drop it from the list, and
    // if it was the one open here, close it and say why.
    this.socketService.getSocket().on('channelDeleted', (data: { id: string; name: string }) => {
      this.allChannels = this.allChannels.filter(c => c.id !== data.id);
      if (this.activeChannelId === data.id) {
        this.activeChannelId = '';
        this.messages = [];
        this.systemMessages = [];
        this.channelNotice = `The channel "${data.name}" was deleted by a group admin.`;
      }
      this.cdr.markForCheck();
    });

    // This user's groups, role or ban status changed on the server
    // (an approval, a promotion, a ban), so re-read the account.
    this.socketService.getSocket().on('membershipChanged', () => {
      this.refreshCurrentUser();
    });

    this.socketService.getSocket().on('newMessage', (message: ChatMessage) => {
      this.messages.push(message);
      this.cdr.markForCheck();
    });

    // Someone deleted one of their messages: take it off this
    // screen too. Nothing replaces it.
    this.socketService.getSocket().on('messageDeleted', (data: { id: string; channelId: string }) => {
      this.messages = this.messages.filter(m => m.id !== data.id);
      this.cdr.markForCheck();
    });

    // The server refused a join or a message, because this user is
    // not a member of the channel's group or has been banned from
    // it. Close the channel, say why, and re-read the user from the
    // server so the group disappears from the list.
    this.socketService.getSocket().on('channelDenied', (data: { channelId: string; message: string }) => {
      if (data.channelId === this.activeChannelId) {
        this.activeChannelId = '';
        this.messages = [];
        this.systemMessages = [];
      }
      this.channelNotice = data.message;
      this.refreshCurrentUser();
      this.cdr.markForCheck();
    });

    this.socketService.getSocket().on('userJoined', (data: { channelId: string; userId?: string; username: string; timestamp: string }) => {
      this.systemMessages.push({
        id: 's' + Date.now(),
        channelId: data.channelId,
        type: 'join',
        userId: data.userId,
        username: data.username,
        timestamp: data.timestamp
      });
      this.cdr.markForCheck();
    });

    this.socketService.getSocket().on('userLeft', (data: { channelId: string; userId?: string; username: string; timestamp: string }) => {
      this.systemMessages.push({
        id: 's' + Date.now(),
        channelId: data.channelId,
        type: 'leave',
        userId: data.userId,
        username: data.username,
        timestamp: data.timestamp
      });
      this.cdr.markForCheck();
    });
  }

  // Tells the server which user this browser tab belongs to.
  private announcePresence(): void {
    this.socketService.getSocket().emit('identify', { userId: this.currentUserId });
  }

  // The group whose channel is open, or undefined if none is.
  get currentGroup(): Group | undefined {
    const channel = this.activeChannel;
    return channel ? this.allGroups.find(g => g.id === channel.groupId) : undefined;
  }

  // "Online Now": the members of the group being viewed, each
  // marked online or offline, with the people who are online first.
  get groupMembers(): { id: string; displayName: string; online: boolean; isAdmin: boolean }[] {
    const group = this.currentGroup;
    if (!group) {
      return [];
    }
    return this.allUsers
      .filter(u => (u.groupIds || []).includes(group.id))
      .map(u => ({
        id: u.id,
        displayName: u.displayName,
        // This user is online by definition: they are looking at the page.
        online: u.id === this.currentUserId || this.onlineUserIds.has(u.id),
        isAdmin: (group.adminIds || []).includes(u.id)
      }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName));
  }

  // Asks the group's admins to remove or ban another member, with
  // a reason. Nothing happens to the member unless an admin
  // approves it on the Group Admin page.
  requestMemberAction(member: { id: string; displayName: string }, action: 'remove' | 'ban'): void {
    const group = this.currentGroup;
    if (!group || member.id === this.currentUserId) {
      return;
    }
    const reason = prompt(`Why should ${member.displayName} be ${action === 'ban' ? 'banned from' : 'removed from'} ${group.title}?`);
    if (reason === null) {
      return;
    }
    if (!reason.trim()) {
      this.channelNotice = 'A request needs a reason.';
      return;
    }
    this.groupService.submitBanRequest({
      requestedBy: this.currentUserId,
      targetUserId: member.id,
      groupId: group.id,
      action,
      reason
    }).subscribe({
      next: () => {
        this.channelNotice = `Your request about ${member.displayName} has been sent to the group's admins.`;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.channelNotice = err.error?.message || 'Your request could not be sent.';
        this.cdr.markForCheck();
      }
    });
  }

  // Re-reads the user list from the server. It fills "Online Now"
  // and also replaces the copy of the current user in localStorage,
  // which dates from login: bans, approvals and promotions since
  // then only exist on the server.
  private refreshCurrentUser(): void {
    this.userService.getUsers().subscribe(users => {
      this.allUsers = users;
      this.onlineUserIds = new Set(users.filter(u => u.online).map(u => u.id));

      const freshUser = users.find(u => u.id === this.currentUserId);
      if (!freshUser) {
        // The account no longer exists, so end the session.
        this.logout();
        return;
      }
      // Banned from the whole system while logged in: end the
      // session and let the login page explain why.
      if (freshUser.isSystemBanned) {
        this.authService.logout();
        this.router.navigate(['/login'], { queryParams: { banned: 'yes' } });
        return;
      }
      this.authService.login(freshUser);
      this.currentUsername = freshUser.displayName || freshUser.username;
      this.currentRole = freshUser.role;
      this.myGroupIds = freshUser.groupIds;
      this.blockedUserIds = freshUser.blockedUserIds || [];
      this.applyMembership();
      this.countUnreadNotifications(freshUser.notificationsReadAt || '');
    });
  }

  // Counts the Super Admin's notifications this user hasn't opened
  // yet: those sent after they last visited the Notifications
  // page. ISO dates compare correctly as plain text.
  private countUnreadNotifications(lastReadAt: string): void {
    this.notificationService.getNotificationsFor(this.currentUserId).subscribe(notifications => {
      this.unreadNotifications = notifications.filter(n => n.createdAt > lastReadAt).length;
      this.cdr.markForCheck();
    });
  }

  // Blocks the sender of a message. From then on their messages
  // and join/leave notices are hidden for this user only. The block
  // is saved on the server, so it survives logging out. It can be
  // undone on the Profile page.
  blockSender(message: ChatMessage): void {
    if (message.senderId === this.currentUserId) {
      return;
    }
    if (!confirm(`Block ${message.senderName}? You will no longer see their messages. You can unblock them on your profile.`)) {
      return;
    }
    this.userService.blockUser(this.currentUserId, message.senderId).subscribe({
      next: () => {
        this.blockedUserIds = [...this.blockedUserIds, message.senderId];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.channelNotice = err.error?.message || 'That user could not be blocked.';
        this.cdr.markForCheck();
      }
    });
  }

  // Reports the sender of a message to the Super Admin, with a
  // reason. A copy of the message goes with the report, because
  // only the last 5 messages of a channel are kept.
  reportSender(message: ChatMessage): void {
    const channel = this.activeChannel;
    if (message.senderId === this.currentUserId || !channel) {
      return;
    }
    const reason = prompt(`Why are you reporting ${message.senderName}?`);
    if (reason === null) {
      return;
    }
    if (!reason.trim()) {
      this.channelNotice = 'A report needs a reason.';
      return;
    }
    this.reportService.submitReport({
      reporterId: this.currentUserId,
      reportedUserId: message.senderId,
      groupId: channel.groupId,
      reason,
      messageText: message.text || (message.imageUrl ? '(image)' : '')
    }).subscribe({
      next: () => {
        this.channelNotice = `Your report about ${message.senderName} has been sent to the Super Admin.`;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.channelNotice = err.error?.message || 'Your report could not be sent.';
        this.cdr.markForCheck();
      }
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
    socket.off('channelDenied');
    socket.off('messageDeleted');
    socket.off('connect');
    socket.off('presenceChanged');
    socket.off('membershipChanged');
    socket.off('channelDeleted');
    socket.off('notification');

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

  // What the thread shows: this channel's messages and join/leave
  // notices in time order, leaving out anything from a user this
  // person has blocked. Blocked content is simply not there; no
  // placeholder is shown.
  get threadItems(): (ChatMessage | SystemMessage)[] {
    const chatItems = this.messages.filter(m =>
      m.channelId === this.activeChannelId && !this.blockedUserIds.includes(m.senderId));
    const systemItems = this.systemMessages.filter(s =>
      s.channelId === this.activeChannelId && !(s.userId && this.blockedUserIds.includes(s.userId)));
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
    this.channelNotice = '';
    this.removePendingImage();

    // The user id lets the server check this user is a member of
    // the channel's group before letting them in.
    this.socketService.getSocket().emit('joinChannel', {
      channelId: this.activeChannelId,
      userId: this.currentUserId,
      username: this.currentUsername
    });

    this.messageService.getRecentMessages(channelId, this.currentUserId).subscribe(history => {
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

  // Runs when a file is picked with the Image button. The file is
  // checked here (type and size) and kept until Send is pressed.
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clear the picker so choosing the same file again still fires.
    input.value = '';
    if (!file) {
      return;
    }
    this.imageError = this.uploadService.checkImage(file);
    this.pendingImage = this.imageError ? null : file;
  }

  // Drops the attached image without sending it.
  removePendingImage(): void {
    this.pendingImage = null;
    this.imageError = '';
  }

  // Sends the draft. A message needs text, an image, or both. An
  // image is uploaded first; only its path travels in the message.
  sendMessage(): void {
    const text = this.draftMessage.trim();
    const image = this.pendingImage;
    const channelId = this.activeChannelId;
    if ((!text && !image) || !channelId || this.isSending) {
      return;
    }

    if (!image) {
      this.emitMessage(channelId, this.draftMessage);
      this.draftMessage = '';
      return;
    }

    this.isSending = true;
    this.imageError = '';
    this.uploadService.uploadImage(image).subscribe({
      next: (uploaded) => {
        this.isSending = false;
        // If the user switched channel while the image uploaded,
        // don't post it into a channel they are no longer in.
        if (this.activeChannelId === channelId) {
          this.emitMessage(channelId, this.draftMessage, uploaded.imageUrl);
          this.draftMessage = '';
          this.pendingImage = null;
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSending = false;
        this.imageError = err.error?.message || 'The image could not be uploaded.';
        this.cdr.markForCheck();
      }
    });
  }

  // Hands one message to the server over the socket.
  private emitMessage(channelId: string, text: string, imageUrl?: string): void {
    this.socketService.getSocket().emit('sendMessage', {
      channelId,
      senderId: this.currentUserId,
      senderName: this.currentUsername,
      text,
      imageUrl,
      // ISO format, the same as the server's join/leave notices, so
      // threadItems can sort both kinds together correctly.
      timestamp: new Date().toISOString()
    });
  }

  // Asks the server to delete one of this user's own messages. The
  // server checks it really is theirs, then tells everyone in the
  // channel, including this window, to remove it.
  deleteMessage(message: ChatMessage): void {
    if (message.senderId !== this.currentUserId) {
      return;
    }
    if (!confirm('Delete this message for everyone? This cannot be undone.')) {
      return;
    }
    this.socketService.getSocket().emit('deleteMessage', { messageId: message.id });
  }

  // Full address for a message's image, for the <img> in the thread.
  imageSrc(imageUrl: string): string {
    return this.uploadService.fullUrl(imageUrl);
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