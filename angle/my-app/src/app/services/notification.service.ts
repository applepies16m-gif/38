import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppNotification, AuditEntry } from '../models/notification.model';

const API_BASE = 'http://localhost:3000/api';

// Talks to the server about the two things only the Super Admin
// produces: one-way notifications, and the audit log.
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  constructor(private http: HttpClient) {}

  // The notifications one user can read: those sent to everyone
  // and those sent only to them, newest first.
  getNotificationsFor(userId: string): Observable<AppNotification[]> {
    return this.http.get<AppNotification[]>(`${API_BASE}/notifications`, { params: { userId } });
  }

  // Every notification ever sent (the Super Admin's own list).
  getAllNotifications(): Observable<AppNotification[]> {
    return this.http.get<AppNotification[]>(`${API_BASE}/notifications`);
  }

  // Sends a notification. recipientId null means everyone.
  sendNotification(sentBy: string, message: string, recipientId: string | null): Observable<AppNotification> {
    return this.http.post<AppNotification>(`${API_BASE}/notifications`, { sentBy, message, recipientId });
  }

  // Tells the server this user has opened their notifications, so
  // the unread count goes back to zero.
  markAllRead(userId: string): Observable<void> {
    return this.http.post<void>(`${API_BASE}/notifications/read`, { userId });
  }

  // The audit log, newest first. Each filter is optional: an action
  // type, and from/to dates written as YYYY-MM-DD.
  getAuditLog(type: string, from: string, to: string): Observable<AuditEntry[]> {
    const params: Record<string, string> = {};
    if (type) { params['type'] = type; }
    if (from) { params['from'] = from; }
    if (to) { params['to'] = to; }
    return this.http.get<AuditEntry[]>(`${API_BASE}/audit-log`, { params });
  }
}
