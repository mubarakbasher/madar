import * as net from "node:net";
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { loadEnv } from "../../env";
import type { VirusScanResult, VirusScanService } from "./virus-scan.service";

const CHUNK_SIZE = 8192;
const CONNECTION_TIMEOUT = 5000;
const SCAN_TIMEOUT = 30000;

@Injectable()
export class ClamAVScanner implements VirusScanService {
  private readonly logger = new Logger(ClamAVScanner.name);

  async scan(buffer: Buffer): Promise<VirusScanResult> {
    const { CLAMAV_HOST, CLAMAV_PORT } = loadEnv();

    return new Promise<VirusScanResult>((resolve, reject) => {
      const socket = new net.Socket();
      const chunks: Buffer[] = [];
      let settled = false;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(err);
      };

      const scanTimer = setTimeout(() => {
        fail(
          new InternalServerErrorException({
            statusCode: 500,
            message: "Virus scanner unavailable",
            code: "scanner_unavailable",
          }),
        );
      }, SCAN_TIMEOUT);

      socket.setTimeout(CONNECTION_TIMEOUT);

      socket.on("timeout", () => {
        this.logger.error(
          `Connection timeout to ClamAV at ${CLAMAV_HOST}:${CLAMAV_PORT}`,
        );
        fail(
          new InternalServerErrorException({
            statusCode: 500,
            message: "Virus scanner unavailable",
            code: "scanner_unavailable",
          }),
        );
      });

      socket.on("error", (err) => {
        this.logger.error(
          `ClamAV connection error: ${err.message}`,
          err.stack,
        );
        fail(
          new InternalServerErrorException({
            statusCode: 500,
            message: "Virus scanner unavailable",
            code: "scanner_unavailable",
          }),
        );
      });

      socket.on("data", (data) => {
        chunks.push(data);
      });

      socket.on("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(scanTimer);
        socket.destroy();

        const response = Buffer.concat(chunks)
          .toString("utf8")
          .replace(/\0$/, "")
          .trim();

        if (response.endsWith("OK")) {
          resolve({ clean: true });
        } else {
          const match = response.match(/^stream:\s*(.+)\s+FOUND$/);
          if (match) {
            resolve({ clean: false, signature: match[1] });
          } else {
            this.logger.warn(`Unexpected ClamAV response: ${response}`);
            resolve({ clean: false, signature: response });
          }
        }
      });

      socket.connect(CLAMAV_PORT, CLAMAV_HOST, () => {
        // Disable the connection timeout once connected — use scan timeout instead
        socket.setTimeout(0);

        // Send INSTREAM command (null-terminated)
        socket.write("zINSTREAM\0");

        // Send buffer in chunks with 4-byte big-endian length prefix
        let offset = 0;
        while (offset < buffer.length) {
          const end = Math.min(offset + CHUNK_SIZE, buffer.length);
          const chunk = buffer.subarray(offset, end);
          const lengthPrefix = Buffer.alloc(4);
          lengthPrefix.writeUInt32BE(chunk.length, 0);
          socket.write(lengthPrefix);
          socket.write(chunk);
          offset = end;
        }

        // Send zero-length sentinel to signal end of stream
        socket.write(Buffer.alloc(4, 0));
      });
    });
  }
}
