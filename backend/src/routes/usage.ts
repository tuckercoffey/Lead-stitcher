import { Router } from 'express';
import { db } from '../db/connection';
import { usageCounters, subscriptions, plans } from '../db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// GET /api/usage
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;
  const now = new Date();

  // Get current subscription and plan
  const subscriptionResult = await db
    .select({
      planCode: plans.code,
      monthlyLimit: plans.monthlyLimit,
      periodStart: subscriptions.periodStart,
      periodEnd: subscriptions.periodEnd,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.accountId, accountId),
        eq(subscriptions.status, 'active'),
        lte(subscriptions.periodStart, now),
        gte(subscriptions.periodEnd, now)
      )
    )
    .limit(1);

  if (subscriptionResult.length === 0) {
    return res.status(404).json({
      error: 'No active subscription found',
    });
  }

  const subscription = subscriptionResult[0];

  // Get current usage
  const usageResult = await db
    .select()
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.accountId, accountId),
        eq(usageCounters.periodStart, subscription.periodStart),
        eq(usageCounters.periodEnd, subscription.periodEnd)
      )
    )
    .limit(1);

  const usage = usageResult[0] || {
    stitchedCount: 0,
    periodStart: subscription.periodStart,
    periodEnd: subscription.periodEnd,
  };

  res.json({
    stitchedCount: usage.stitchedCount,
    limit: subscription.monthlyLimit,
    periodStart: subscription.periodStart,
    periodEnd: subscription.periodEnd,
    planCode: subscription.planCode,
    status: subscription.status,
    remaining: Math.max(0, subscription.monthlyLimit - usage.stitchedCount),
    percentUsed: Math.round((usage.stitchedCount / subscription.monthlyLimit) * 100),
  });
}));

// GET /api/usage/history
router.get('/history', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;
  const limit = parseInt(req.query.limit as string) || 12; // Default to 12 months

  const history = await db
    .select({
      periodStart: usageCounters.periodStart,
      periodEnd: usageCounters.periodEnd,
      stitchedCount: usageCounters.stitchedCount,
    })
    .from(usageCounters)
    .where(eq(usageCounters.accountId, accountId))
    .orderBy(usageCounters.periodStart)
    .limit(limit);

  res.json({
    history,
  });
}));

export default router;

