import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../models/user.model';

const API_URL = 'http://localhost:3000/api/users';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(private http: HttpClient) {}

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(API_URL);
  }

  createUser(user: Partial<User>): Observable<User> {
    return this.http.post<User>(API_URL, user);
  }

  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/${id}`);
  }
}