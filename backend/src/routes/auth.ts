import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/connection';
import { users, accounts, subscriptions, plans, usageCounters } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateToken, authenticateToken } from '../middleware/auth';
import { ValidationError, AuthenticationError, asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import Joi from 'joi';

const router = Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  accountName: Joi.string().min(2).max(160).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { email, password, accountName } = value;

  // Check if user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existingUser.length > 0) {
    throw new ValidationError('User with this email already exists');
  }

  // Hash password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Start transaction
  const result = await db.transaction(async (tx) => {
    // Create account
    const [account] = await tx
      .insert(accounts)
      .values({
        name: accountName,
        timezone: 'America/New_York',
      })
      .returning();

    // Create user
    const [user] = await tx
      .insert(users)
      .values({
        accountId: account.id,
        email: email.toLowerCase(),
        hash: hashedPassword,
        role: 'owner',
      })
      .returning();

    // Get FREE plan
    const [freePlan] = await tx
      .select()
      .from(plans)
      .where(eq(plans.code, 'FREE'))
      .limit(1);

    if (!freePlan) {
      throw new Error('FREE plan not found. Please run database seed.');
    }

    // Create subscription
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    
    await tx.insert(subscriptions).values({
      accountId: account.id,
      planId: freePlan.id,
      periodStart: now,
      periodEnd,
      status: 'active',
    });

    // Create usage counter
    await tx.insert(usageCounters).values({
      accountId: account.id,
      periodStart: now,
      periodEnd,
      stitchedCount: 0,
    });

    return { user, account };
  });

  // Generate JWT token
  const token = generateToken({
    userId: result.user.id,
    email: result.user.email,
    accountId: result.user.accountId,
    role: result.user.role,
  });

  // Set secure cookie
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  logger.info('User registered successfully', {
    userId: result.user.id,
    email: result.user.email,
    accountId: result.account.id,
  });

  res.status(201).json({
    message: 'Registration successful',
    user: {
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
      accountId: result.user.accountId,
      accountName: result.account.name,
    },
    token,
  });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { email, password } = value;

  // Find user with account info
  const userResult = await db
    .select({
      id: users.id,
      email: users.email,
      hash: users.hash,
      role: users.role,
      accountId: users.accountId,
      accountName: accounts.name,
    })
    .from(users)
    .innerJoin(accounts, eq(users.accountId, accounts.id))
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (userResult.length === 0) {
    throw new AuthenticationError('Invalid email or password');
  }

  const user = userResult[0];

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.hash);
  if (!isValidPassword) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Generate JWT token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    accountId: user.accountId,
    role: user.role,
  });

  // Set secure cookie
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  logger.info('User logged in successfully', {
    userId: user.id,
    email: user.email,
    accountId: user.accountId,
  });

  res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      accountId: user.accountId,
      accountName: user.accountName,
    },
    token,
  });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logout successful' });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    user: req.user,
  });
});

export default router;

