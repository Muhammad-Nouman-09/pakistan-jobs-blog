import { createHash, randomBytes } from "node:crypto";

/** Invitation tokens: 256 random bits, URL-safe. Only the SHA-256 hash is stored in the database. */
export const generateToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
