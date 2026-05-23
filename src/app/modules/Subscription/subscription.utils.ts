import crypto from "crypto";

export const verifyWebhookSignature = (
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean => {
  if (!signature || !secret) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  const digestBuffer = Buffer.from(digest, "hex");

  if (signatureBuffer.length !== digestBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
};

export const toDateOrNull = (value?: string): Date | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};
