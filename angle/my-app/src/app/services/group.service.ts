import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Group,
  JoinRequest,
  GroupCreationRequest,
  RoomRequest,
  BanRequest,
} from '../models/group.model';
import { environment } from '../../environments/environment';

const API_URL = `${environment.serverUrl}/api/groups`;

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  constructor(private http: HttpClient) {}

  // Every group.
  getGroups(): Observable<Group[]> {
    return this.http.get<Group[]>(API_URL);
  }

  // Creates a group. The server also gives it a "general" channel and
  // makes its admins members.
  createGroup(group: Partial<Group>): Observable<Group> {
    return this.http.post<Group>(API_URL, group);
  }

  // Every request to join a group.
  getJoinRequests(): Observable<JoinRequest[]> {
    return this.http.get<JoinRequest[]>(`${environment.serverUrl}/api/join-requests`);
  }

  // Asks to join a group. The server refuses if the user is banned,
  // already a member, or under the age limit.
  submitJoinRequest(request: Partial<JoinRequest>): Observable<JoinRequest> {
    return this.http.post<JoinRequest>(`${environment.serverUrl}/api/join-requests`, request);
  }

  // Every request for a new group.
  getGroupRequests(): Observable<GroupCreationRequest[]> {
    return this.http.get<GroupCreationRequest[]>(`${environment.serverUrl}/api/group-requests`);
  }

  // Asks the Super Admin for a new group.
  submitGroupRequest(request: Partial<GroupCreationRequest>): Observable<GroupCreationRequest> {
    return this.http.post<GroupCreationRequest>(
      `${environment.serverUrl}/api/group-requests`,
      request,
    );
  }

  // Records the Super Admin's decision on a request for a new group.
  updateGroupRequest(id: string, status: string, rejectionReason?: string): Observable<void> {
    return this.http.put<void>(`${environment.serverUrl}/api/group-requests/${id}`, {
      status,
      rejectionReason,
    });
  }

  // Changes a group's settings or its list of admins.
  updateGroup(id: string, updates: Partial<Group>): Observable<void> {
    return this.http.put<void>(`${API_URL}/${id}`, updates);
  }

  // Approves or rejects a join request.
  updateJoinRequest(id: string, status: string, rejectionReason?: string): Observable<void> {
    return this.http.put<void>(`${environment.serverUrl}/api/join-requests/${id}`, {
      status,
      rejectionReason,
    });
  }

  // Every request from a member for a new channel.
  getRoomRequests(): Observable<RoomRequest[]> {
    return this.http.get<RoomRequest[]>(`${environment.serverUrl}/api/room-requests`);
  }

  // A member asks the admins of one group for a new channel there.
  submitRoomRequest(request: Partial<RoomRequest>): Observable<RoomRequest> {
    return this.http.post<RoomRequest>(`${environment.serverUrl}/api/room-requests`, request);
  }

  // A Group Admin approves or rejects a channel request. Approving
  // creates the channel.
  updateRoomRequest(id: string, status: string, rejectionReason?: string): Observable<void> {
    return this.http.put<void>(`${environment.serverUrl}/api/room-requests/${id}`, {
      status,
      rejectionReason,
    });
  }

  // Every request to remove or ban someone from a group.
  getBanRequests(): Observable<BanRequest[]> {
    return this.http.get<BanRequest[]>(`${environment.serverUrl}/api/ban-requests`);
  }

  // Asks for someone to be removed or banned from a group, with a
  // reason.
  submitBanRequest(request: Partial<BanRequest>): Observable<BanRequest> {
    return this.http.post<BanRequest>(`${environment.serverUrl}/api/ban-requests`, request);
  }

  // Approves or rejects a request to remove or ban someone.
  updateBanRequest(id: string, status: string, rejectionReason?: string): Observable<void> {
    return this.http.put<void>(`${environment.serverUrl}/api/ban-requests/${id}`, {
      status,
      rejectionReason,
    });
  }
}
