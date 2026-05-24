import * as net from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock loadEnv before importing the scanner
let mockHost = "127.0.0.1";
let mockPort = 3310;

vi.mock("../../src/env", () => ({
  loadEnv: () => ({
    VIRUS_SCANNER: "clamav",
    CLAMAV_HOST: mockHost,
    CLAMAV_PORT: mockPort,
  }),
}));

import { ClamAVScanner } from "../../src/common/virus-scan/clamav-scanner";

function createMockClamAVServer(
  responseFactory: (data: Buffer) => string,
): net.Server {
  const server = net.createServer((socket) => {
    const chunks: Buffer[] = [];
    let receivedCommand = false;

    socket.on("data", (data) => {
      chunks.push(data);

      // Parse the protocol: first we get zINSTREAM\0, then length-prefixed chunks,
      // then a zero-length sentinel
      const combined = Buffer.concat(chunks);

      // Check for command header
      if (!receivedCommand) {
        const nullIdx = combined.indexOf(0);
        if (nullIdx >= 0) {
          receivedCommand = true;
        }
      }

      // Check for zero-length sentinel (4 zero bytes) at the end
      if (
        combined.length >= 4 &&
        combined[combined.length - 4] === 0 &&
        combined[combined.length - 3] === 0 &&
        combined[combined.length - 2] === 0 &&
        combined[combined.length - 1] === 0
      ) {
        // Extract the file data from the stream (skip command + parse chunks)
        const response = responseFactory(combined);
        socket.end(response);
      }
    });
  });

  return server;
}

describe("ClamAVScanner", () => {
  let scanner: ClamAVScanner;

  beforeAll(() => {
    scanner = new ClamAVScanner();
  });

  describe("clean file", () => {
    let server: net.Server;
    let port: number;

    beforeAll(async () => {
      server = createMockClamAVServer(() => "stream: OK\0");
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });
      const addr = server.address() as net.AddressInfo;
      port = addr.port;
      mockHost = "127.0.0.1";
      mockPort = port;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("returns clean: true for a safe file", async () => {
      const buffer = Buffer.from("Hello, this is a safe file content.");
      const result = await scanner.scan(buffer);
      expect(result).toEqual({ clean: true });
    });
  });

  describe("infected file", () => {
    let server: net.Server;
    let port: number;

    beforeAll(async () => {
      server = createMockClamAVServer(
        () => "stream: Eicar-Signature FOUND\0",
      );
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });
      const addr = server.address() as net.AddressInfo;
      port = addr.port;
      mockHost = "127.0.0.1";
      mockPort = port;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("returns clean: false with signature for an infected file", async () => {
      const buffer = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR");
      const result = await scanner.scan(buffer);
      expect(result).toEqual({ clean: false, signature: "Eicar-Signature" });
    });
  });

  describe("connection refused", () => {
    beforeAll(() => {
      // Point at a port with nothing listening
      mockHost = "127.0.0.1";
      mockPort = 19999;
    });

    it("throws InternalServerErrorException with scanner_unavailable code", async () => {
      const buffer = Buffer.from("test data");
      await expect(scanner.scan(buffer)).rejects.toMatchObject({
        response: {
          statusCode: 500,
          message: "Virus scanner unavailable",
          code: "scanner_unavailable",
        },
      });
    });
  });
});
