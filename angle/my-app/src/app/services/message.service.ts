import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ChatMessage } from '../models/message.model';

const API_URL = 'http://localhost:3000/api/messages';

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  constructor(private http: HttpClient) {}

  // The server returns at most the 5 most recent messages for the
  // channel, oldest first, since that's all it keeps.
  getRecentMessages(channelId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(API_URL, { params: { channelId } });
  }
}