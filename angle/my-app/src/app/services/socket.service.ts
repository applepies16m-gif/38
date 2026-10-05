import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

const SOCKET_URL = environment.serverUrl;

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket = io(SOCKET_URL);

  getSocket(): Socket {
    return this.socket;
  }
}