import { io, Socket } from 'socket.io-client';
import api from './api';

// api baseURL looks like http://<host>:5000/api, the socket server is the same host without /api
const origin = () => String(api.defaults.baseURL ?? '').replace(/\/api\/?$/, '');

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(token: string): Socket {
  if (!socket || socketToken !== token) {
    socket?.disconnect();
    socket = io(origin(), { auth: { token } });
    socketToken = token;
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}