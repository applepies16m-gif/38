export interface Channel {
  id: string;
  name: string;
  groupId: string;
}

export interface JoinRequest {
  id: string;
  userId: string;
  groupId: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}

export interface RoomRequest {
  id: string;
  requestedBy: string;   // userId
  groupId: string;
  roomName: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}

export interface Group {
  id: string;
  title: string;          // max 30 chars, enforced in the form
  description: string;    // max 250 chars, enforced in the form
  ageLimit: number;       // 0 = no restriction
  adminIds: string[];     // must always contain at least one id
  channelIds: string[];
  theme?: string;         // optional group background/theme
}
export interface GroupCreationRequest {
  id: string;
  requestedBy: string;   // userId — becomes the group's admin once approved
  proposedTitle: string;
  proposedDescription: string;
  proposedAgeLimit?: number;   // minimum age for the new group; 0 or missing = no limit
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}
export interface BanRequest {
  id: string;
  requestedBy: string;   // userId of the member requesting the ban
  targetUserId: string;  // userId the request is about
  groupId: string;
  action?: 'remove' | 'ban';                  // remove = out of the group; ban = also can't rejoin. Old requests have none and mean ban
  reviewer?: 'group_admin' | 'super_admin';   // who decides: the Super Admin when the target is a Group Admin
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}