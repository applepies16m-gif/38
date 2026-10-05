// A one-way message from the Super Admin. Users can read it but
// cannot reply.
export interface AppNotification {
  id: string;
  message: string;
  recipientId: string | null;  // null = sent to everyone
  sentBy: string;              // userId of the Super Admin who sent it
  createdAt: string;           // ISO date
}

// One line of the audit log: an admin action, who did it and when.
export interface AuditEntry {
  id: string;
  type: string;               // e.g. "member_banned", "group_created"
  summary: string;            // a sentence describing what happened
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  createdAt: string;          // ISO date
}
