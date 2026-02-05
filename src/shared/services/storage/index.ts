import { config } from "@config/app.config.js";
import { FirebaseStorageProvider } from "./firebase-storage.provider.js";
import { R2StorageProvider } from "./r2-storage.provider.js";
import type { StorageProvider } from "./storage.provider.js";

let instance: StorageProvider | null = null;

/**
 * Get the configured storage provider singleton.
 * Returns R2 when STORAGE_PROVIDER=r2, Firebase otherwise.
 */
export function getStorageProvider(): StorageProvider {
  if (!instance) {
    instance =
      config.storage.provider === "r2"
        ? new R2StorageProvider()
        : new FirebaseStorageProvider();
  }
  return instance;
}

export type { StorageProvider };
