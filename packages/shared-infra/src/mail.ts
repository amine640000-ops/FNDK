import { createTransport } from "nodemailer";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type SendMailResult = {
  skipped: boolean;
  messageId?: string;
};

const readBoolean = (value: string | undefined) => ["1", "true", "yes"].includes(value?.toLowerCase() ?? "");
const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getSmtpTransport = () => {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;

  return createTransport({
    host,
    port,
    secure: readBoolean(process.env.SMTP_SECURE),
    connectionTimeout: readPositiveInteger(process.env.SMTP_CONNECTION_TIMEOUT_MS, 8000),
    greetingTimeout: readPositiveInteger(process.env.SMTP_GREETING_TIMEOUT_MS, 8000),
    socketTimeout: readPositiveInteger(process.env.SMTP_SOCKET_TIMEOUT_MS, 10000),
    auth: user ? { user, pass } : undefined
  });
};

export const sendMail = async ({ to, subject, text, html }: SendMailInput): Promise<SendMailResult> => {
  const transport = getSmtpTransport();
  if (!transport) {
    console.warn("[mail] SMTP_HOST is not configured; email delivery skipped.");
    return { skipped: true };
  }

  const from = process.env.SMTP_FROM?.trim() || `${process.env.PLATFORM_NAME ?? "FNDK"} <no-reply@fndk.capital>`;
  const info = await transport.sendMail({ from, to, subject, text, html });

  return {
    skipped: false,
    messageId: info.messageId
  };
};
