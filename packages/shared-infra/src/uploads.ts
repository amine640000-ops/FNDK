import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import { diskStorage } from "multer";
import type { Request } from "express";

type StorageFile = Express.Multer.File;
type DestinationCallback = (error: Error | null, destination: string) => void;
type FilenameCallback = (error: Error | null, filename: string) => void;
type CloudinaryUploadResponse = {
  secure_url?: string;
  url?: string;
  error?: {
    message?: string;
  };
};

type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
};

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

const getCloudinaryConfig = (): CloudinaryConfig | null => {
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  if (cloudinaryUrl) {
    const parsedUrl = new URL(cloudinaryUrl);

    return {
      cloudName: parsedUrl.hostname,
      apiKey: decodeURIComponent(parsedUrl.username),
      apiSecret: decodeURIComponent(parsedUrl.password),
      folder: process.env.CLOUDINARY_UPLOAD_FOLDER || "fndk"
    };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || "fndk"
  };
};

export const isCloudinaryUploadsEnabled = () => getCloudinaryConfig() !== null;

export const uploadFileToCloudinary = async (filePath: string, namespace: string) => {
  const config = getCloudinaryConfig();

  if (!config) {
    throw new Error("Cloudinary upload is not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = `${config.folder}/${namespace}`.replace(/\/+/g, "/");
  const signaturePayload = `folder=${folder}&timestamp=${timestamp}${config.apiSecret}`;
  const signature = createHash("sha1").update(signaturePayload).digest("hex");
  const file = await readFile(filePath);
  const formData = new FormData();

  formData.append("file", new Blob([new Uint8Array(file)]), filePath.split("/").pop() ?? "upload");
  formData.append("api_key", config.apiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", folder);
  formData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
    method: "POST",
    body: formData
  });
  const payload = (await response.json()) as CloudinaryUploadResponse;

  if (!response.ok || (!payload.secure_url && !payload.url)) {
    throw new Error(payload.error?.message || "Cloudinary upload failed");
  }

  return payload.secure_url ?? payload.url!;
};
