
export enum UserRole {
  HOST = 'HOST',
  LISTENER = 'LISTENER'
}

export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  isAI?: boolean;
}

export interface RoomState {
  id: string;
  isLive: boolean;
  activeListeners: number;
  currentVibe?: string;
}

export interface RoomInfo {
  id: string;
  hostName: string;
  vibe: string;
  listenerCount: number;
  lastSeen: number;
}

export type DiscoveryMessage = 
  | { type: 'REGISTER_ROOM'; room: RoomInfo }
  | { type: 'REQUEST_ROOMS' }
  | { type: 'ROOM_LIST'; rooms: RoomInfo[] }
  | { type: 'HEARTBEAT'; roomId: string; listenerCount: number; vibe: string };
