import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Channel } from '../models/group.model';

const API_URL = 'http://localhost:3000/api/channels';

@Injectable({
  providedIn: 'root'
})
export class ChannelService {
  constructor(private http: HttpClient) {}

  getChannels(): Observable<Channel[]> {
    return this.http.get<Channel[]>(API_URL);
  }

  createChannel(channel: Partial<Channel>): Observable<Channel> {
    return this.http.post<Channel>(API_URL, channel);
  }

  // Deletes a channel and its messages. The server refuses to
  // delete a group's last channel.
  deleteChannel(id: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/${id}`);
  }
}