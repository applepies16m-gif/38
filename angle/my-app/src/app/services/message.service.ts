import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ChatMessage } from '../models/message.model';
import { environment } from '../../environments/environment';

const API_URL = `${environment.serverUrl}/api/messages`;

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  constructor(private http: HttpClient) {}

  // The server returns at most the 5 most recent messages for the
  // channel, oldest first, since that's all it keeps. The user id
  // lets the server check membership; a user who isn't allowed in
  // the channel gets an empty list.
  getRecentMessages(channelId: string, userId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(API_URL, { params: { channelId, userId } });
  }
}