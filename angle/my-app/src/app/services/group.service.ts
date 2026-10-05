import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Group, JoinRequest, GroupCreationRequest, RoomRequest, BanRequest } from '../models/group.model';
import { environment } from '../../environments/environment';

const API_URL = `${environment.serverUrl}/api/groups`;

@Injectable({
  providedIn: 'root'
})
export class GroupService {
  constructor(private http: HttpClient) {}

  getGroups(): Observable<Group[]> {
    return this.http.get<Group[]>(API_URL);
  }

  createGroup(group: Partial<Group>): Observable<Group> {
    return this.http.post<Group>(API_URL, group);
  }
  getJoinRequests(): Observable<JoinRequest[]> {
  return this.http.get<JoinRequest[]>(`${environment.serverUrl}/api/join-requests`);
}

submitJoinRequest(request: Partial<JoinRequest>): Observable<JoinRequest> {
  return this.http.post<JoinRequest>(`${environment.serverUrl}/api/join-requests`, request);
}
getGroupRequests(): Observable<GroupCreationRequest[]> {
  return this.http.get<GroupCreationRequest[]>(`${environment.serverUrl}/api/group-requests`);
}

submitGroupRequest(request: Partial<GroupCreationRequest>): Observable<GroupCreationRequest> {
  return this.http.post<GroupCreationRequest>(`${environment.serverUrl}/api/group-requests`, request);
}

updateGroupRequest(id: string, status: string, rejectionReason?: string): Observable<void> {
  return this.http.put<void>(`${environment.serverUrl}/api/group-requests/${id}`, { status, rejectionReason });
}

updateGroup(id: string, updates: Partial<Group>): Observable<void> {
  return this.http.put<void>(`${API_URL}/${id}`, updates);
}

updateJoinRequest(id: string, status: string, rejectionReason?: string): Observable<void> {
  return this.http.put<void>(`${environment.serverUrl}/api/join-requests/${id}`, { status, rejectionReason });
}
getRoomRequests(): Observable<RoomRequest[]> {
  return this.http.get<RoomRequest[]>(`${environment.serverUrl}/api/room-requests`);
}

submitRoomRequest(request: Partial<RoomRequest>): Observable<RoomRequest> {
  return this.http.post<RoomRequest>(`${environment.serverUrl}/api/room-requests`, request);
}

updateRoomRequest(id: string, status: string, rejectionReason?: string): Observable<void> {
  return this.http.put<void>(`${environment.serverUrl}/api/room-requests/${id}`, { status, rejectionReason });
}

getBanRequests(): Observable<BanRequest[]> {
  return this.http.get<BanRequest[]>(`${environment.serverUrl}/api/ban-requests`);
}

submitBanRequest(request: Partial<BanRequest>): Observable<BanRequest> {
  return this.http.post<BanRequest>(`${environment.serverUrl}/api/ban-requests`, request);
}

updateBanRequest(id: string, status: string, rejectionReason?: string): Observable<void> {
  return this.http.put<void>(`${environment.serverUrl}/api/ban-requests/${id}`, { status, rejectionReason });
}
}