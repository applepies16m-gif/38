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