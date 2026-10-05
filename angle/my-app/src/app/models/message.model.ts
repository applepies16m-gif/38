export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  timestamp: string;
}

export interface SystemMessage {
  id: string;
  channelId: string;
  type: 'join' | 'leave';
  userId?: string;   // who joined or left, so notices about a blocked user can be hidden
  username: string;
  timestamp: string;
}