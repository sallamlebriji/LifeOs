import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Argon2id with OWASP-recommended parameters (m=19 MiB, t=2, p=1). */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** A pre-computed hash used to equalise timing when the account doesn't exist. */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

/** 256-bit opaque token, URL-safe. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored only as SHA-256 hex digests (they are high-entropy, so no salt needed). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
