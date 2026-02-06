import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';

/** Shape of claims embedded in every MCP JWT. */
export interface TokenPayload {
  sub: string; // user_id
  org: string; // org / team / enterprise id
  jti: string; // unique token id (for revocation)
  iat: number;
  exp: number;
}

const TOKEN_EXPIRY = '90d';

function getSigningSecret(): string {
  const secret = process.env.MCP_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'MCP_SIGNING_SECRET must be set and at least 32 characters. Generate one with: openssl rand -hex 32'
    );
  }
  return secret;
}

/**
 * Create a signed JWT for a specific user.
 * Automatically revokes any previously active tokens for the same user+org.
 */
export function signToken(userId: string, orgId: string): string {
  const db = getDatabase();
  const secret = getSigningSecret();
  const jti = crypto.randomUUID();

  // Revoke all existing active tokens for this user+org (one-active-token rule)
  revokeAllForUser(userId, orgId);

  const token = jwt.sign({ sub: userId, org: orgId }, secret, {
    expiresIn: TOKEN_EXPIRY,
    jwtid: jti,
  });

  // Decode to get the exact expiry written by jsonwebtoken
  const decoded = jwt.decode(token) as TokenPayload;

  db.prepare(
    `INSERT INTO tokens (jti, user_id, org_id, expires_at) VALUES (?, ?, ?, datetime(?, 'unixepoch'))`
  ).run(jti, userId, orgId, decoded.exp);

  return token;
}

/**
 * Verify a JWT and ensure it has not been revoked.
 * Returns the decoded payload or throws on any failure.
 */
export function verifyToken(token: string): TokenPayload {
  const secret = getSigningSecret();
  const payload = jwt.verify(token, secret) as TokenPayload;

  const db = getDatabase();
  const row = db
    .prepare('SELECT is_revoked FROM tokens WHERE jti = ?')
    .get(payload.jti) as { is_revoked: number } | undefined;

  if (!row) {
    throw new Error('Token not found in registry');
  }
  if (row.is_revoked) {
    throw new Error('Token has been revoked');
  }

  return payload;
}

/** Revoke a single token by its jti. */
export function revokeToken(jti: string): void {
  const db = getDatabase();
  db.prepare('UPDATE tokens SET is_revoked = 1 WHERE jti = ?').run(jti);
}

/** Revoke every active token for a given user+org. */
export function revokeAllForUser(userId: string, orgId: string): void {
  const db = getDatabase();
  db.prepare(
    'UPDATE tokens SET is_revoked = 1 WHERE user_id = ? AND org_id = ? AND is_revoked = 0'
  ).run(userId, orgId);
}

/** Delete expired and revoked tokens from the database. */
export function cleanupExpiredTokens(): void {
  const db = getDatabase();
  const result = db
    .prepare(
      "DELETE FROM tokens WHERE expires_at < datetime('now') OR is_revoked = 1"
    )
    .run();
  if (result.changes > 0) {
    console.log(
      `Token cleanup: removed ${result.changes} expired/revoked tokens`
    );
  }
}
