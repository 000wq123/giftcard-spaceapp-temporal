import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const secret = process.env.SPACE_SESSION_SECRET || process.env.SPACE_DATABASE_URL || "spaceapp-database-master-key-fallback";
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plainText: string): string {
  if (!plainText) return "";
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    ciphertext: encrypted.toString("base64"),
    tag: authTag.toString("base64")
  });
}

export function decryptSecret(encryptedPayload: string | null | undefined): string {
  if (!encryptedPayload) return "";
  try {
    const parsed = JSON.parse(encryptedPayload) as { iv: string; ciphertext: string; tag: string };
    if (!parsed.iv || !parsed.ciphertext || !parsed.tag) return "";
    const key = getEncryptionKey();
    const iv = Buffer.from(parsed.iv, "base64");
    const ciphertext = Buffer.from(parsed.ciphertext, "base64");
    const tag = Buffer.from(parsed.tag, "base64");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final("utf8");
  } catch (error) {
    console.error("[databases/crypto] Decryption failed:", error);
    return "";
  }
}
