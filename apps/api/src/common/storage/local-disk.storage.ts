import { Injectable, Logger } from "@nestjs/common";
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "../../env";
import type { StorageService } from "./storage.service";

/**
 * Filesystem-backed storage. Writes to ${STORAGE_ROOT}/${path}. Creates
 * intermediate directories on put().
 */
@Injectable()
export class LocalDiskStorage implements StorageService {
  private readonly logger = new Logger(LocalDiskStorage.name);

  private rootDir(): string {
    // Read on every call so tests can override STORAGE_ROOT mid-process.
    // loadEnv() caches, so for tests we read process.env directly first.
    const fromProc = process.env.STORAGE_ROOT;
    if (fromProc && fromProc.length > 0) return path.resolve(fromProc);
    const env = loadEnv();
    if (env.STORAGE_ROOT && env.STORAGE_ROOT.length > 0) return path.resolve(env.STORAGE_ROOT);
    return path.resolve(process.cwd(), "var", "storage");
  }

  private resolve(rel: string): string {
    if (rel.startsWith("/") || rel.includes("..")) {
      throw new Error(`Invalid storage path: ${rel}`);
    }
    return path.join(this.rootDir(), ...rel.split("/"));
  }

  async put(rel: string, buffer: Buffer): Promise<void> {
    const abs = this.resolve(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
  }

  async get(rel: string): Promise<Buffer> {
    return fs.readFile(this.resolve(rel));
  }

  async exists(rel: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(rel));
      return true;
    } catch {
      return false;
    }
  }

  async delete(rel: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(rel));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}
