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
  username: string;
  timestamp: string;
}