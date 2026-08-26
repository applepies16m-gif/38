export interface User {
  id: string;
  username: string;
  password?: string;
  displayName: string;
  email: string;
  role: 'super_admin' | 'group_admin' | 'user';
  online: boolean;
  groupIds: string[];
  bannedFromGroupIds: string[];
  isSystemBanned: boolean;
}