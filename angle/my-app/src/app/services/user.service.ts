import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../models/user.model';
import { environment } from '../../environments/environment';

const API_BASE = `${environment.serverUrl}/api`;
const API_URL = `${API_BASE}/users`;

@Injectable({
  providedIn: 'root',
})
export class UserService {
  constructor(private http: HttpClient) {}
  checkBootstrapStatus(): Observable<{ needsBootstrap: boolean }> {
    return this.http.get<{ needsBootstrap: boolean }>(`${API_BASE}/bootstrap-status`);
  }

  // Creates the first Super Admin. The server only allows this while
  // no account exists.
  bootstrapSuperAdmin(user: Partial<User>): Observable<User> {
    return this.http.post<User>(`${API_BASE}/bootstrap`, user);
  }

  // Changes fields on a user. The server decides which fields may
  // change and checks each value.
  updateUser(id: string, updates: Partial<User>): Observable<void> {
    return this.http.put<void>(`${API_URL}/${id}`, updates);
  }

  // Every user, without passwords, each marked online or offline.
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(API_URL);
  }

  // Creates an account (used by Register and by the Admin Panel).
  createUser(user: Partial<User>): Observable<User> {
    return this.http.post<User>(API_URL, user);
  }

  // Blocks another user for this user. The block is saved on the
  // server, so it is still there after logging out and in.
  blockUser(id: string, blockedUserId: string): Observable<void> {
    return this.http.post<void>(`${API_URL}/${id}/blocks`, { blockedUserId });
  }

  // Removes a block.
  unblockUser(id: string, blockedUserId: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/${id}/blocks/${blockedUserId}`);
  }

  // Deletes an account. The server refuses for the only admin of a
  // group.
  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/${id}`);
  }

  // Checks a username and password with the server and returns the
  // user.
  login(username: string, password: string): Observable<User> {
    return this.http.post<User>(`${API_BASE}/login`, { username, password });
  }
}
