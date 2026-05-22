/**
 * Virus scan abstraction. 1.11a ships a Noop implementation that always
 * reports clean — real ClamAV daemon wiring lands with 1.11d, swapped in via
 * the module's provider.
 */
export interface VirusScanResult {
  clean: boolean;
  signature?: string;
}

export interface VirusScanService {
  scan(buffer: Buffer): Promise<VirusScanResult>;
}

export const VIRUS_SCAN_SERVICE = Symbol("VirusScanService");
