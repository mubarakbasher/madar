import { Global, Module } from "@nestjs/common";
import { ClamAVScanner } from "./clamav-scanner";
import { NoopScanner } from "./noop-scanner";
import { VIRUS_SCAN_SERVICE } from "./virus-scan.service";
import { loadEnv } from "../../env";

@Global()
@Module({
  providers: [
    NoopScanner,
    ClamAVScanner,
    {
      provide: VIRUS_SCAN_SERVICE,
      useFactory: (noop: NoopScanner, clamav: ClamAVScanner) =>
        loadEnv().VIRUS_SCANNER === "clamav" ? clamav : noop,
      inject: [NoopScanner, ClamAVScanner],
    },
  ],
  exports: [VIRUS_SCAN_SERVICE],
})
export class VirusScanModule {}
