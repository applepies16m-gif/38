export interface User {
  id: string;
  username: string;
  password?: string;
  displayName: string;
  email: string;
  dateOfBirth?: string;    // ISO date string, e.g. "1971-01-01"
  role: 'super_admin' | 'group_admin' | 'user';
  online: boolean;
  groupIds: string[];
  bannedFromGroupIds: string[];
  isSystemBanned: boolean;
}