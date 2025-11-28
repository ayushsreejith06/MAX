/**
 * WebSocket/Real-time event contract for MAX backend.
 * 
 * This module documents the WebSocket event names and payloads
 * that the backend broadcasts via Socket.IO.
 * 
 * TODO: Wire up actual Socket.IO client connection and event handlers.
 * 
 * Backend WebSocket endpoint: /socket.io/ (Socket.IO protocol)
 * Connection example:
 *   import { io } from 'socket.io-client';
 *   const socket = io('http://localhost:8000');
 */

// ============================================================================
// Event Types
// ============================================================================

/**
 * Market update event.
 * Broadcast when market data changes (global index or sector-specific).
 * 
 * Event name: "market:update"
 * 
 * Payload:
 *   - timestamp: string (ISO 8601 format)
 *   - sectorId?: string (if sector-specific update)
 *   - value?: number (sector price/index value)
 *   - indexValue?: number (global market index value)
 */
export interface MarketUpdateEvent {
  timestamp: string;
  sectorId?: string;
  value?: number;
  indexValue?: number;
}

/**
 * Sector candle update event.
 * Broadcast when new candle data is available for a sector.
 * 
 * Event name: "sector:candle_update"
 * 
 * Payload:
 *   - sectorId: string
 *   - candle: CandlePoint (time and value)
 */
export interface SectorCandleUpdateEvent {
  sectorId: string;
  candle: {
    time: string; // Format: "HH:MM"
    value: number;
  };
}

/**
 * New discussion message event.
 * Broadcast when a new message is posted in a discussion.
 * 
 * Event name: "discussion:new_message"
 * 
 * Payload:
 *   - discussionId: string
 *   - message: Message (full message object)
 */
export interface DiscussionNewMessageEvent {
  discussionId: string;
  message: {
    id: string;
    discussionId: string;
    agentId: string | null;
    agentName: string;
    content: string;
    timestamp: string;
  };
}

/**
 * Agent status update event.
 * Broadcast when an agent's status changes.
 * 
 * Event name: "agent:status_update"
 * 
 * Payload:
 *   - agentId: string
 *   - status: string (AgentStatus: "active" | "idle" | "processing" | "offline")
 *   - sectorId?: string (optional sector ID)
 */
export interface AgentStatusUpdateEvent {
  agentId: string;
  status: 'active' | 'idle' | 'processing' | 'offline';
  sectorId?: string;
}

/**
 * Connection confirmation event.
 * Emitted by server when client successfully connects.
 * 
 * Event name: "connected"
 * 
 * Payload:
 *   - message: string
 */
export interface ConnectedEvent {
  message: string;
}

// ============================================================================
// Client Connection Interface (TODO: Implement)
// ============================================================================

/**
 * TODO: Implement WebSocket client connection.
 * 
 * Example implementation:
 * 
 * ```typescript
 * import { io, Socket } from 'socket.io-client';
 * 
 * class RealtimeClient {
 *   private socket: Socket | null = null;
 *   private apiBaseUrl: string;
 * 
 *   constructor(apiBaseUrl: string = 'http://localhost:8000') {
 *     this.apiBaseUrl = apiBaseUrl;
 *   }
 * 
 *   connect() {
 *     this.socket = io(this.apiBaseUrl, {
 *       transports: ['websocket', 'polling'],
 *     });
 * 
 *     this.socket.on('connect', () => {
 *       console.log('Connected to MAX realtime server');
 *     });
 * 
 *     this.socket.on('connected', (data: ConnectedEvent) => {
 *       console.log('Server confirmation:', data.message);
 *     });
 * 
 *     this.socket.on('market:update', (data: MarketUpdateEvent) => {
 *       // Handle market update
 *     });
 * 
 *     this.socket.on('sector:candle_update', (data: SectorCandleUpdateEvent) => {
 *       // Handle candle update
 *     });
 * 
 *     this.socket.on('discussion:new_message', (data: DiscussionNewMessageEvent) => {
 *       // Handle new message
 *     });
 * 
 *     this.socket.on('agent:status_update', (data: AgentStatusUpdateEvent) => {
 *       // Handle agent status update
 *     });
 * 
 *     this.socket.on('disconnect', () => {
 *       console.log('Disconnected from MAX realtime server');
 *     });
 *   }
 * 
 *   disconnect() {
 *     if (this.socket) {
 *       this.socket.disconnect();
 *       this.socket = null;
 *     }
 *   }
 * 
 *   // Helper methods to subscribe to specific events
 *   onMarketUpdate(callback: (data: MarketUpdateEvent) => void) {
 *     this.socket?.on('market:update', callback);
 *   }
 * 
 *   onSectorCandleUpdate(callback: (data: SectorCandleUpdateEvent) => void) {
 *     this.socket?.on('sector:candle_update', callback);
 *   }
 * 
 *   onDiscussionNewMessage(callback: (data: DiscussionNewMessageEvent) => void) {
 *     this.socket?.on('discussion:new_message', callback);
 *   }
 * 
 *   onAgentStatusUpdate(callback: (data: AgentStatusUpdateEvent) => void) {
 *     this.socket?.on('agent:status_update', callback);
 *   }
 * }
 * 
 * export const realtimeClient = new RealtimeClient();
 * ```
 */

// ============================================================================
// Event Handler Types (for future use)
// ============================================================================

export type MarketUpdateHandler = (event: MarketUpdateEvent) => void;
export type SectorCandleUpdateHandler = (event: SectorCandleUpdateEvent) => void;
export type DiscussionNewMessageHandler = (event: DiscussionNewMessageEvent) => void;
export type AgentStatusUpdateHandler = (event: AgentStatusUpdateEvent) => void;

