import { Global, Module } from "@nestjs/common";
import { NoopScanner } from "./noop-scanner";
import { VIRUS_SCAN_SERVICE } from "./virus-scan.service";

@Global()
@Module({
  providers: [
    NoopScanner,
    { provide: VIRUS_SCAN_SERVICE, useExisting: NoopScanner },
  ],
  exports: [VIRUS_SCAN_SERVICE, NoopScanner],
})
export class VirusScanModule {}
