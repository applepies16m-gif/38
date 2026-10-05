// One user's report about another, with a reason. The Super Admin
// decides each one in the Admin Panel.
export interface Report {
  id: string;
  reporterId: string; // userId of the person who made the report
  reportedUserId: string; // userId of the person it is about
  groupId: string; // the group it happened in
  reason: string;
  messageText: string; // copy of the message, since only the last 5 are stored
  status: 'open' | 'resolved' | 'dismissed';
  decisionNote?: string; // the Super Admin's note when deciding
  createdAt: string; // ISO date
  decidedAt?: string;
}
