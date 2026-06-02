import { mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { diskStorage } from "multer";
import type { Request } from "express";

type StorageFile = Express.Multer.File;
type DestinationCallback = (error: Error | null, destination: string) => void;
type FilenameCallback = (error: Error | null, filename: string) => void;

export const getUploadsRoot = () => process.env.UPLOADS_DIR || join(process.cwd(), "uploads");

const ensureDir = (namespace: string) => {
  const dir = join(getUploadsRoot(), namespace);
  mkdirSync(dir, { recursive: true });
  return dir;
};

export const ensureUploadsRoot = () => {
  const uploadsRoot = getUploadsRoot();
  mkdirSync(uploadsRoot, { recursive: true });
  return uploadsRoot;
};

export const createDiskStorageOptions = (namespace: string) => ({
  storage: diskStorage({
    destination: (_request: Request, _file: StorageFile, callback: DestinationCallback) =>
      callback(null, ensureDir(namespace)),
    filename: (_request: Request, file: StorageFile, callback: FilenameCallback) => {
      const extension = extname(file.originalname);
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `${suffix}${extension}`);
    }
  })
});

export const toPublicUploadUrl = (namespace: string, filename: string) => `/uploads/${namespace}/${filename}`;
