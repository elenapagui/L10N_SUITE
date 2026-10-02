/** Mensajes entre el proceso principal y el motor (utilityProcess). */
export interface EngineRequest {
  type: 'request';
  id: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Uint8Array;
}

export interface EngineResponse {
  type: 'response';
  id: number;
  status: number;
  headers: Record<string, string | string[]>;
  body: Uint8Array;
}

export type EngineMessage =
  | { type: 'ready' }
  | { type: 'fatal'; message: string }
  | { type: 'shutdown-done' }
  | EngineResponse;

export type EngineStatus = 'ready' | 'restarting' | 'failed';
