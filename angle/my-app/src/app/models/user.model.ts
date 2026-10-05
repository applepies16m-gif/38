export interface User {
  id: string;
  username: string;
  password?: string;
  firstName?: string;      // collected at register and bootstrap; older accounts have none
  lastName?: string;
  displayName: string;
  email: string;
  dateOfBirth?: string;    // ISO date string, e.g. "1971-01-01"
  profilePicUrl?: string;  // path from the upload endpoint, e.g. "/uploads/3f9a...c2.png"
  role: 'super_admin' | 'group_admin' | 'user';
  online: boolean;
  groupIds: string[];
  bannedFromGroupIds: string[];
  isSystemBanned: boolean;
  blockedUserIds?: string[]; // users whose messages this user has chosen not to see
  notificationsReadAt?: string; // ISO date the user last opened their notifications
}