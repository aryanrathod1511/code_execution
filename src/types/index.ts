export interface LanguageConfig {
  image: string;
  filename: string;
  compileCmd: string[] | null;
  runCmd: string[];
}

export interface ExecutionRequest {
  code: string;
  language: string;
  input?: string;
}

export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timeMs?: number;
  errorType?: 'COMPILATION_ERROR' | 'RUNTIME_ERROR' | 'TIMEOUT_ERROR' | 'SYSTEM_ERROR';
}

export interface InitPacket {
  type: 'init';
  language: string;
  code: string;
}

export interface InputPacket {
  type: 'input';
  input: string;
}

export type WebSocketPacket = InitPacket | InputPacket;
