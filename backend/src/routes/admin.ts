import { Router } from 'express';
import { db } from '../db/connection';
import { plans, usageCounters, subscriptions, accounts } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { authenticateToken, requireOwnerOrAdmin } from '../middleware/auth';
import { ValidationError, asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// All admin routes require owner or admin role
router.use(authenticateToken);
router.use(requireOwnerOrAdmin);

// POST /api/admin/seedPlans
router.post('/seedPlans', asyncHandler(async (req, res) => {
  try {
    // Insert plans if they don't exist
    const existingPlans = await db.select().from(plans);
    
    if (existingPlans.length === 0) {
      await db.insert(plans).values([
        { code: 'FREE', monthlyLimit: 250, priceUsd: 0 },
        { code: 'STARTER', monthlyLimit: 5000, priceUsd: 10 },
        { code: 'PRO', monthlyLimit: 10000, priceUsd: 20 }
      ]);

      logger.info('Plans seeded successfully', {
        adminUserId: req.user!.id,
        accountId: req.user!.accountId,
      });

      res.json({
        message: 'Plans seeded successfully',
        plans: [
          { code: 'FREE', monthlyLimit: 250, priceUsd: 0 },
          { code: 'STARTER', monthlyLimit: 5000, priceUsd: 10 },
          { code: 'PRO', monthlyLimit: 10000, priceUsd: 20 }
        ],
      });
    } else {
      res.json({
        message: 'Plans already exist',
        plans: existingPlans,
      });
    }
  } catch (error) {
    logger.error('Failed to seed plans', {
      error: error.message,
      adminUserId: req.user!.id,
    });
    throw error;
  }
}));

// POST /api/admin/resetUsage
router.post('/resetUsage', asyncHandler(async (req, res) => {
  const { accountId } = req.body;

  if (accountId && typeof accountId !== 'number') {
    throw new ValidationError('Invalid account ID');
  }

  try {
    let resetCount = 0;

    if (accountId) {
      // Reset usage for specific account
      const result = await db
        .update(usageCounters)
        .set({ stitchedCount: 0 })
        .where(eq(usageCounters.accountId, accountId))
        .returning();

      resetCount = result.length;

      logger.info('Usage reset for account', {
        accountId,
        adminUserId: req.user!.id,
        resetCount,
      });
    } else {
      // Reset usage for all accounts (monthly cron)
      const result = await db
        .update(usageCounters)
        .set({ stitchedCount: 0 })
        .returning();

      resetCount = result.length;

      logger.info('Usage reset for all accounts', {
        adminUserId: req.user!.id,
        resetCount,
      });
    }

    res.json({
      message: accountId 
        ? `Usage reset for account ${accountId}`
        : 'Usage reset for all accounts',
      resetCount,
    });
  } catch (error) {
    logger.error('Failed to reset usage', {
      error: error.message,
      accountId,
      adminUserId: req.user!.id,
    });
    throw error;
  }
}));

// GET /api/admin/stats
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    // Get system statistics
    const [accountCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(accounts);

    const [activeSubscriptions] = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'));

    const [totalUsage] = await db
      .select({ total: sql<number>`sum(${usageCounters.stitchedCount})` })
      .from(usageCounters);

    // Get plan distribution
    const planDistribution = await db
      .select({
        planCode: plans.code,
        count: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.status, 'active'))
      .groupBy(plans.code);

    const stats = {
      totalAccounts: accountCount.count || 0,
      activeSubscriptions: activeSubscriptions.count || 0,
      totalStitchedLeads: totalUsage.total || 0,
      planDistribution: planDistribution.reduce((acc, item) => {
        acc[item.planCode] = item.count;
        return acc;
      }, {} as Record<string, number>),
    };

    logger.info('Admin stats accessed', {
      adminUserId: req.user!.id,
      stats,
    });

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get admin stats', {
      error: error.message,
      adminUserId: req.user!.id,
    });
    throw error;
  }
}));

// GET /api/admin/accounts
router.get('/accounts', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const accountsList = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        timezone: accounts.timezone,
        createdAt: accounts.createdAt,
        planCode: plans.code,
        subscriptionStatus: subscriptions.status,
        stitchedCount: usageCounters.stitchedCount,
      })
      .from(accounts)
      .leftJoin(subscriptions, eq(accounts.id, subscriptions.accountId))
      .leftJoin(plans, eq(subscriptions.planId, plans.id))
      .leftJoin(usageCounters, eq(accounts.id, usageCounters.accountId))
      .limit(limit)
      .offset(offset)
      .orderBy(accounts.createdAt);

    logger.info('Admin accounts list accessed', {
      adminUserId: req.user!.id,
      limit,
      offset,
      resultCount: accountsList.length,
    });

    res.json({
      accounts: accountsList,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Failed to get accounts list', {
      error: error.message,
      adminUserId: req.user!.id,
    });
    throw error;
  }
}));

// POST /api/admin/accounts/:id/suspend
router.post('/accounts/:id/suspend', asyncHandler(async (req, res) => {
  const accountId = parseInt(req.params.id);

  if (isNaN(accountId)) {
    throw new ValidationError('Invalid account ID');
  }

  try {
    // Update subscription status to suspended
    const result = await db
      .update(subscriptions)
      .set({ status: 'suspended' })
      .where(eq(subscriptions.accountId, accountId))
      .returning();

    if (result.length === 0) {
      throw new ValidationError('Account not found or no active subscription');
    }

    logger.warn('Account suspended', {
      accountId,
      adminUserId: req.user!.id,
      reason: req.body.reason || 'No reason provided',
    });

    res.json({
      message: `Account ${accountId} suspended successfully`,
      accountId,
    });
  } catch (error) {
    logger.error('Failed to suspend account', {
      error: error.message,
      accountId,
      adminUserId: req.user!.id,
    });
    throw error;
  }
}));

// POST /api/admin/accounts/:id/reactivate
router.post('/accounts/:id/reactivate', asyncHandler(async (req, res) => {
  const accountId = parseInt(req.params.id);

  if (isNaN(accountId)) {
    throw new ValidationError('Invalid account ID');
  }

  try {
    // Update subscription status to active
    const result = await db
      .update(subscriptions)
      .set({ status: 'active' })
      .where(eq(subscriptions.accountId, accountId))
      .returning();

    if (result.length === 0) {
      throw new ValidationError('Account not found or no subscription');
    }

    logger.info('Account reactivated', {
      accountId,
      adminUserId: req.user!.id,
    });

    res.json({
      message: `Account ${accountId} reactivated successfully`,
      accountId,
    });
  } catch (error) {
    logger.error('Failed to reactivate account', {
      error: error.message,
      accountId,
      adminUserId: req.user!.id,
    });
    throw error;
  }
}));

// GET /api/admin/health
router.get('/health', asyncHandler(async (req, res) => {
  try {
    // Check database connectivity
    await db.select().from(accounts).limit(1);

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    res.json(health);
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message,
      adminUserId: req.user!.id,
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
}));

export default router;

