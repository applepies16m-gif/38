import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3000';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket = io(SOCKET_URL);

  getSocket(): Socket {
    return this.socket;
  }
}