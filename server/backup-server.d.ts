export interface BackupServerHandle {
  server: import('node:http').Server;
  port: number;
  dir: string;
}

export function startBackupServer(options?: {
  port?: number;
  backupDir?: string;
}): Promise<BackupServerHandle>;
