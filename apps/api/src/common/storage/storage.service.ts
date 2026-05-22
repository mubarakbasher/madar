/**
 * Storage abstraction. 1.11a ships LocalDiskStorage that writes to
 * ${STORAGE_ROOT}/${path}. Real MinIO/S3 implementation lands in 1.11d via a
 * sibling `s3.storage.ts` swapped in by the module's `useClass`.
 *
 * All paths are forward-slash relative ("tenants/{tid}/payment-proofs/{id}.jpg")
 * — the impl normalizes to the platform separator.
 */
export interface StorageService {
  put(path: string, buffer: Buffer): Promise<void>;
  get(path: string): Promise<Buffer>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
}

export const STORAGE_SERVICE = Symbol("StorageService");
