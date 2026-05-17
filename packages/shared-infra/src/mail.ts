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
const readEnv = (value: string | undefined) => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1).trim();
  }

  return trimmedValue;
};

const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(readEnv(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseMailAddress = (value: string) => {
  const trimmedValue = readEnv(value) ?? "";
  const match = trimmedValue.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) {
    return { email: trimmedValue };
  }

  const name = match[1].trim().replace(/^["']|["']$/g, "");
  return {
    email: match[2].trim(),
    ...(name ? { name } : {})
  };
};

const getSender = () => {
  const senderEmail = readEnv(process.env.BREVO_SENDER_EMAIL);
  if (senderEmail) {
    const senderName = readEnv(process.env.BREVO_SENDER_NAME);
    return {
      email: senderEmail,
      ...(senderName ? { name: senderName } : {})
    };
  }

  return parseMailAddress(
    readEnv(process.env.SMTP_FROM) || `${readEnv(process.env.PLATFORM_NAME) ?? "FNDK"} <no-reply@fndk.capital>`
  );
};

const sendBrevoMail = async ({ to, subject, text, html }: SendMailInput): Promise<SendMailResult> => {
  const apiKey = readEnv(process.env.BREVO_API_KEY);
  if (!apiKey) {
    return { skipped: true };
  }

  const timeoutMs = readPositiveInteger(process.env.BREVO_API_TIMEOUT_MS, 10000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: getSender(),
        to: [{ email: to }],
        subject,
        textContent: text,
        ...(html ? { htmlContent: html } : {})
      }),
      signal: controller.signal
    });

    const responseBody = (await response.text()).trim();
    if (!response.ok) {
      throw new Error(`Brevo email API failed with ${response.status}: ${responseBody || response.statusText}`);
    }

    let messageId: string | undefined;
    if (responseBody) {
      try {
        const parsedBody = JSON.parse(responseBody) as { messageId?: unknown };
        messageId = typeof parsedBody.messageId === "string" ? parsedBody.messageId : undefined;
      } catch {
        messageId = undefined;
      }
    }

    return {
      skipped: false,
      messageId
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const getSmtpTransport = () => {
  const host = readEnv(process.env.SMTP_HOST);
  if (!host) {
    return null;
  }

  const port = Number(readEnv(process.env.SMTP_PORT) ?? 587);
  const user = readEnv(process.env.SMTP_USER);
  const pass = readEnv(process.env.SMTP_PASS);

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
  const brevoResult = await sendBrevoMail({ to, subject, text, html });
  if (!brevoResult.skipped) {
    return brevoResult;
  }

  const transport = getSmtpTransport();
  if (!transport) {
    console.warn("[mail] BREVO_API_KEY and SMTP_HOST are not configured; email delivery skipped.");
    return { skipped: true };
  }

  const from = readEnv(process.env.SMTP_FROM) || `${readEnv(process.env.PLATFORM_NAME) ?? "FNDK"} <no-reply@fndk.capital>`;
  const info = await transport.sendMail({ from, to, subject, text, html });

  return {
    skipped: false,
    messageId: info.messageId
  };
};
