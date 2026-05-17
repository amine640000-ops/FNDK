import { createHmac, randomInt } from "crypto";

const getVerificationSecret = () =>
  process.env.VERIFICATION_CODE_SECRET ?? process.env.JWT_ACCESS_SECRET ?? "dev-verification-secret";

export const createNumericVerificationCode = (length = 6) => {
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, "0");
};

export const normalizeVerificationCode = (code: string) => code.trim().replace(/\s+/g, "");

export const hashVerificationCode = (code: string) =>
  createHmac("sha256", getVerificationSecret()).update(normalizeVerificationCode(code)).digest("hex");

export const hashVerificationContext = (context: string) =>
  createHmac("sha256", getVerificationSecret()).update(context).digest("hex");
