import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  maskApiKey,
  verifyPassword,
} from './crypto.ts';

test('encryptSecret and decryptSecret round-trip plaintext with AES-256-GCM', () => {
  const secret = 'azure-key-1234567890-abcdef';
  const cipher = encryptSecret(secret);
  assert.ok(cipher.startsWith('v1:'));
  assert.notEqual(cipher, secret);
  assert.equal(decryptSecret(cipher), secret);
  assert.equal(decryptSecret('invalid-format'), '');
  assert.equal(decryptSecret(null), '');
});

test('maskApiKey redacts middle characters cleanly', () => {
  assert.equal(maskApiKey('sk-1234567890abcd'), 'sk-1••••abcd');
  assert.equal(maskApiKey('short'), '••••••••');
  assert.equal(maskApiKey(''), '');
});

test('hashPassword and verifyPassword validate scrypt hashes safely', () => {
  const hash = hashPassword('super-secret-password');
  assert.equal(verifyPassword('super-secret-password', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});
