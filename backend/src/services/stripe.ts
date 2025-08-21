import Stripe from 'stripe';
import { logger } from '../utils/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: '2023-10-16',
});

export interface CreateCheckoutSessionParams {
  priceId: string;
  customerId?: string;
  customerEmail: string;
  accountId: number;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CreateCustomerParams {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CreateBillingPortalSessionParams {
  customerId: string;
  returnUrl: string;
}

export class StripeService {
  /**
   * Create a new Stripe customer
   */
  async createCustomer(params: CreateCustomerParams): Promise<Stripe.Customer> {
    try {
      const customer = await stripe.customers.create({
        email: params.email,
        name: params.name,
        metadata: params.metadata || {},
      });

      logger.info('Stripe customer created', {
        customerId: customer.id,
        email: params.email,
      });

      return customer;
    } catch (error) {
      logger.error('Failed to create Stripe customer', {
        error: error.message,
        email: params.email,
      });
      throw new Error(`Failed to create customer: ${error.message}`);
    }
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
    try {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: params.priceId,
            quantity: 1,
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: {
          accountId: params.accountId.toString(),
          ...params.metadata,
        },
        subscription_data: {
          metadata: {
            accountId: params.accountId.toString(),
          },
        },
      };

      // Use existing customer or create new one
      if (params.customerId) {
        sessionParams.customer = params.customerId;
      } else {
        sessionParams.customer_email = params.customerEmail;
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      logger.info('Stripe checkout session created', {
        sessionId: session.id,
        accountId: params.accountId,
        priceId: params.priceId,
      });

      return session;
    } catch (error) {
      logger.error('Failed to create checkout session', {
        error: error.message,
        accountId: params.accountId,
        priceId: params.priceId,
      });
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }
  }

  /**
   * Create a billing portal session
   */
  async createBillingPortalSession(params: CreateBillingPortalSessionParams): Promise<Stripe.BillingPortal.Session> {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl,
      });

      logger.info('Stripe billing portal session created', {
        sessionId: session.id,
        customerId: params.customerId,
      });

      return session;
    } catch (error) {
      logger.error('Failed to create billing portal session', {
        error: error.message,
        customerId: params.customerId,
      });
      throw new Error(`Failed to create billing portal session: ${error.message}`);
    }
  }

  /**
   * Retrieve a customer by ID
   */
  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    try {
      const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
      return customer;
    } catch (error) {
      logger.error('Failed to retrieve customer', {
        error: error.message,
        customerId,
      });
      throw new Error(`Failed to retrieve customer: ${error.message}`);
    }
  }

  /**
   * Get customer's active subscriptions
   */
  async getCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
      });

      return subscriptions.data;
    } catch (error) {
      logger.error('Failed to retrieve customer subscriptions', {
        error: error.message,
        customerId,
      });
      throw new Error(`Failed to retrieve subscriptions: ${error.message}`);
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await stripe.subscriptions.cancel(subscriptionId);

      logger.info('Stripe subscription canceled', {
        subscriptionId,
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to cancel subscription', {
        error: error.message,
        subscriptionId,
      });
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Construct webhook event from raw body and signature
   */
  constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      throw new Error('Stripe webhook secret not configured');
    }

    try {
      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      logger.error('Failed to construct webhook event', {
        error: error.message,
      });
      throw new Error(`Webhook signature verification failed: ${error.message}`);
    }
  }

  /**
   * Get all available prices/plans
   */
  async getPrices(): Promise<Stripe.Price[]> {
    try {
      const prices = await stripe.prices.list({
        active: true,
        type: 'recurring',
        expand: ['data.product'],
      });

      return prices.data;
    } catch (error) {
      logger.error('Failed to retrieve prices', {
        error: error.message,
      });
      throw new Error(`Failed to retrieve prices: ${error.message}`);
    }
  }
}

export const stripeService = new StripeService();

