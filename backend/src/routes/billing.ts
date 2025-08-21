import { Router } from 'express';
import { db } from '../db/connection';
import { subscriptions, plans } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { ValidationError, NotFoundError, asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { stripeService } from '../services/stripe';
import Joi from 'joi';

const router = Router();

// Validation schema
const checkoutSchema = Joi.object({
  planCode: Joi.string().valid('STARTER', 'PRO').required(),
});

// GET /api/billing/portal
router.get('/portal', authenticateToken, asyncHandler(async (req, res) => {
  const accountId = req.user!.accountId;

  // Get current subscription
  const subscriptionResult = await db
    .select({
      stripeCustomerId: subscriptions.stripeCustomerId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.accountId, accountId),
        eq(subscriptions.status, 'active')
      )
    )
    .limit(1);

  if (subscriptionResult.length === 0) {
    throw new NotFoundError('No active subscription found');
  }

  const subscription = subscriptionResult[0];

  if (!subscription.stripeCustomerId) {
    throw new ValidationError('No Stripe customer ID found');
  }

  try {
    // Create Stripe billing portal session
    const session = await stripeService.createBillingPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings`,
    });

    logger.info('Billing portal accessed', {
      accountId,
      customerId: subscription.stripeCustomerId,
      sessionId: session.id,
    });

    res.json({
      url: session.url,
    });
  } catch (error) {
    logger.error('Failed to create billing portal session', {
      accountId,
      customerId: subscription.stripeCustomerId,
      error: error.message,
    });
    throw new ValidationError('Failed to create billing portal session');
  }
}));

// POST /api/billing/checkout
router.post('/checkout', authenticateToken, asyncHandler(async (req, res) => {
  const { error, value } = checkoutSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const accountId = req.user!.accountId;
  const userEmail = req.user!.email;
  const { planCode } = value;

  // Get plan details
  const planResult = await db
    .select()
    .from(plans)
    .where(eq(plans.code, planCode))
    .limit(1);

  if (planResult.length === 0) {
    throw new NotFoundError('Plan not found');
  }

  const plan = planResult[0];

  // Check current subscription
  const currentSubscription = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.accountId, accountId),
        eq(subscriptions.status, 'active')
      )
    )
    .limit(1);

  let customerId: string | undefined;
  
  if (currentSubscription.length > 0 && currentSubscription[0].stripeCustomerId) {
    customerId = currentSubscription[0].stripeCustomerId;
  }

  try {
    // Create Stripe checkout session
    const session = await stripeService.createCheckoutSession({
      priceId: plan.stripePriceId || `price_${planCode.toLowerCase()}`, // Use actual Stripe price ID
      customerId,
      customerEmail: userEmail,
      accountId,
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?success=true`,
      cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?canceled=true`,
      metadata: {
        planCode,
        accountId: accountId.toString(),
      },
    });

    logger.info('Checkout session created', {
      accountId,
      planCode,
      sessionId: session.id,
      priceUsd: plan.priceUsd,
    });

    res.json({
      url: session.url,
      sessionId: session.id,
      planCode,
      priceUsd: plan.priceUsd,
    });
  } catch (error) {
    logger.error('Failed to create checkout session', {
      accountId,
      planCode,
      error: error.message,
    });
    throw new ValidationError('Failed to create checkout session');
  }
}));

// POST /api/billing/webhook
router.post('/webhook', asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'] as string;
  
  if (!signature) {
    throw new ValidationError('Missing Stripe signature');
  }

  let event;
  
  try {
    // Verify webhook signature
    event = stripeService.constructWebhookEvent(req.body, signature);
  } catch (error) {
    logger.error('Webhook signature verification failed', {
      error: error.message,
    });
    return res.status(400).json({ error: 'Invalid signature' });
  }

  logger.info('Webhook received', {
    type: event.type,
    id: event.id,
  });

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionCancellation(event.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        await handlePaymentSuccess(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handlePaymentFailure(event.data.object);
        break;
      
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      
      default:
        logger.info('Unhandled webhook event', { type: event.type });
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing failed', {
      eventType: event.type,
      eventId: event.id,
      error: error.message,
    });
    res.status(400).json({ error: 'Webhook processing failed' });
  }
}));

// GET /api/billing/plans
router.get('/plans', asyncHandler(async (req, res) => {
  const allPlans = await db
    .select()
    .from(plans)
    .orderBy(plans.priceUsd);

  res.json({
    plans: allPlans.map(plan => ({
      code: plan.code,
      monthlyLimit: plan.monthlyLimit,
      priceUsd: plan.priceUsd,
      features: getPlanFeatures(plan.code),
    })),
  });
}));

// Helper function to get plan features
function getPlanFeatures(planCode: string): string[] {
  switch (planCode) {
    case 'FREE':
      return [
        '250 stitched leads/month',
        'Basic attribution models',
        'CSV export',
        'Email support',
      ];
    case 'STARTER':
      return [
        '5,000 stitched leads/month',
        'All attribution models',
        'Advanced matching',
        'CSV export',
        'Priority support',
      ];
    case 'PRO':
      return [
        '10,000+ stitched leads/month',
        'All attribution models',
        'Advanced matching',
        'Custom policies',
        'API access',
        'Priority support',
      ];
    default:
      return [];
  }
}

// Webhook handlers
async function handleCheckoutCompleted(session: any): Promise<void> {
  logger.info('Processing checkout completion', {
    sessionId: session.id,
    customerId: session.customer,
    subscriptionId: session.subscription,
    accountId: session.metadata?.accountId,
  });

  const accountId = parseInt(session.metadata?.accountId);
  if (!accountId) {
    logger.error('No account ID in checkout session metadata', {
      sessionId: session.id,
    });
    return;
  }

  // Create or update customer record
  if (session.customer && session.subscription) {
    try {
      // Get subscription details from Stripe
      const subscription = await stripeService.getCustomer(session.customer);
      
      // Update or create subscription record
      await db.insert(subscriptions).values({
        accountId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        status: 'active',
        planId: 1, // This should be determined from the subscription
      }).onConflictDoUpdate({
        target: subscriptions.accountId,
        set: {
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          status: 'active',
        },
      });

      logger.info('Subscription created/updated from checkout', {
        accountId,
        customerId: session.customer,
        subscriptionId: session.subscription,
      });
    } catch (error) {
      logger.error('Failed to process checkout completion', {
        sessionId: session.id,
        accountId,
        error: error.message,
      });
    }
  }
}

async function handleSubscriptionUpdate(subscription: any): Promise<void> {
  logger.info('Processing subscription update', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
  });

  // In production, update subscription in database
  // This would involve mapping Stripe customer ID to account ID
  // and updating the subscription record
}

async function handleSubscriptionCancellation(subscription: any): Promise<void> {
  logger.info('Processing subscription cancellation', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
  });

  // In production, update subscription status to canceled
  // and potentially downgrade to FREE plan
}

async function handlePaymentSuccess(invoice: any): Promise<void> {
  logger.info('Processing payment success', {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    amount: invoice.amount_paid,
  });

  // In production, update subscription status and reset usage counters
}

async function handlePaymentFailure(invoice: any): Promise<void> {
  logger.info('Processing payment failure', {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    amount: invoice.amount_due,
  });

  // In production, update subscription status to past_due
  // and potentially send notification emails
}

export default router;

