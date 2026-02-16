import crypto from "node:crypto";

const CIPHER = "aes-256-gcm";
const VERSION = "v1";

function toBase64(input: Buffer): string {
  return input.toString("base64url");
}

function fromBase64(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export class SecretBox {
  readonly #key: Buffer;

  constructor(secret: string) {
    if (!secret || secret.trim().length < 16) {
      throw new Error(
        "DEPLOYMENTS_ENCRYPTION_KEY must be set and at least 16 characters",
      );
    }
    this.#key = crypto.scryptSync(secret, "claw-launchpad-deployments", 32);
  }

  encryptObject(value: unknown): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(CIPHER, this.#key, iv);
    const json = Buffer.from(JSON.stringify(value), "utf8");
    const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, toBase64(iv), toBase64(tag), toBase64(encrypted)].join(".");
  }

  decryptObject<T>(payload: string): T {
    const [version, ivB64, tagB64, encryptedB64] = String(payload || "").split(".");
    if (version !== VERSION || !ivB64 || !tagB64 || !encryptedB64) {
      throw new Error("Invalid encrypted payload format");
    }

    const iv = fromBase64(ivB64);
    const tag = fromBase64(tagB64);
    const encrypted = fromBase64(encryptedB64);

    const decipher = crypto.createDecipheriv(CIPHER, this.#key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
      "utf8",
    );
    return JSON.parse(plaintext) as T;
  }
}
