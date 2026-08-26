import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Group } from '../models/group.model';

const API_URL = 'http://localhost:3000/api/groups';

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
}