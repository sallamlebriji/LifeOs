import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoBox } from './crypto-box';

describe('CryptoBox', () => {
  const box = new CryptoBox(randomBytes(32).toString('base64'));

  it('round-trips and never repeats ciphertext', () => {
    const a = box.encrypt('{"refresh_token":"secret"}', 'user-1');
    const b = box.encrypt('{"refresh_token":"secret"}', 'user-1');
    expect(a).not.toBe(b);
    expect(a).not.toContain('secret');
    expect(box.decrypt(a, 'user-1')).toBe('{"refresh_token":"secret"}');
  });

  it('rejects tampering, the wrong context and the wrong key', () => {
    const c = box.encrypt('hello', 'user-1');
    const parts = c.split(':');
    parts[3] = Buffer.from('jello').toString('base64url');
    expect(() => box.decrypt(parts.join(':'), 'user-1')).toThrow();
    expect(() => box.decrypt(c, 'user-2')).toThrow();
    expect(() => new CryptoBox(randomBytes(32).toString('base64')).decrypt(c, 'user-1')).toThrow();
    expect(() => new CryptoBox('short')).toThrow(/32 bytes/);
  });
});
