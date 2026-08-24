export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  timestamp: string;
}