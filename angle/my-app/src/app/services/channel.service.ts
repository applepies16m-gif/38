import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Channel } from '../models/group.model';
import { environment } from '../../environments/environment';

const API_URL = `${environment.serverUrl}/api/channels`;

@Injectable({
  providedIn: 'root',
})
export class ChannelService {
  constructor(private http: HttpClient) {}

  // Every channel, in every group.
  getChannels(): Observable<Channel[]> {
    return this.http.get<Channel[]>(API_URL);
  }

  // Adds a channel to a group.
  createChannel(channel: Partial<Channel>): Observable<Channel> {
    return this.http.post<Channel>(API_URL, channel);
  }

  // Deletes a channel and its messages. The server refuses to
  // delete a group's last channel.
  deleteChannel(id: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/${id}`);
  }
}
