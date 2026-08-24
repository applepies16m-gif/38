export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;          // locked after registration
  role: 'super_admin' | 'group_admin' | 'user';
  online: boolean;
  groupIds: string[];     // groups this user has been approved into
  bannedFromGroupIds: string[];
  isSystemBanned: boolean;
}