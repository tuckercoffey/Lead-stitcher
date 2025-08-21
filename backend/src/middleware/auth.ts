import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/connection';
import { users, accounts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { logger } from '../utils/logger';

export interface AuthenticatedUser {
  id: number;
  email: string;
  accountId: number;
  role: string;
  accountName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface JWTPayload {
  userId: number;
  email: string;
  accountId: number;
  role: string;
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new AuthenticationError('Invalid or expired token');
  }
}

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check for token in Authorization header or cookies
    let token: string | undefined;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }

    // Verify token
    const payload = verifyToken(token);

    // Fetch user details from database
    const userResult = await db
      .select({
        id: users.id,
        email: users.email,
        accountId: users.accountId,
        role: users.role,
        accountName: accounts.name,
      })
      .from(users)
      .innerJoin(accounts, eq(users.accountId, accounts.id))
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (userResult.length === 0) {
      throw new AuthenticationError('User not found');
    }

    const user = userResult[0];
    
    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      accountId: user.accountId,
      role: user.role,
      accountName: user.accountName,
    };

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      next(error);
    } else {
      logger.error('Authentication error:', error);
      next(new AuthenticationError('Authentication failed'));
    }
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new AuthorizationError(`Role '${req.user.role}' not authorized`));
      return;
    }

    next();
  };
}

export function requireOwnerOrAdmin(req: Request, res: Response, next: NextFunction): void {
  requireRole(['owner', 'admin'])(req, res, next);
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  // Try to authenticate but don't fail if no token
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies.auth_token;

  if (!token) {
    next();
    return;
  }

  // Use the main auth middleware but catch errors
  authenticateToken(req, res, (error) => {
    if (error) {
      // Log the error but continue without authentication
      logger.debug('Optional auth failed:', error.message);
    }
    next();
  });
}

