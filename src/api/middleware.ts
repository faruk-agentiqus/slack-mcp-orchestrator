import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from '../auth/tokens.js';

/**
 * Extend Express Request to carry the authenticated user context.
 */
export interface AuthenticatedRequest extends Request {
  tokenPayload: TokenPayload;
}

/**
 * Express middleware that validates the Bearer JWT on every request.
 * Attaches the decoded payload to `req.tokenPayload`.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res
      .status(401)
      .json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    (req as AuthenticatedRequest).tokenPayload = payload;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    res.status(401).json({ error: message });
  }
}
