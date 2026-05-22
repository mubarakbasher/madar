import { Injectable } from "@nestjs/common";
import type { VirusScanResult, VirusScanService } from "./virus-scan.service";

/**
 * Dev/test scanner — always returns clean. Production wiring (clamav) lands
 * with 1.11d. Keeps the contract intact so tests + manual smoke work.
 */
@Injectable()
export class NoopScanner implements VirusScanService {
  async scan(_buffer: Buffer): Promise<VirusScanResult> {
    return { clean: true };
  }
}
