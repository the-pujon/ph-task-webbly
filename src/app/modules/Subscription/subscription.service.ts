import Stripe from "stripe";
import httpStatus from "http-status";
import AppError from "../../errors/AppError";
import config from "../../config";
import { User } from "../Auth/auth.model";
import { ProcessedWebhookEvent } from "./webhookEvent.model";
import { Subscription, SubscriptionPlan } from "./subscription.model";
import {
  BillingInterval,
  IStripeCheckoutResult,
  ISubscription,
  ISubscriptionPlan,
  SubscriptionStatus,
} from "./subscription.interface";

const STRIPE_DEFAULT_SUCCESS_URL =
  "http://localhost:4000/api/v1/subscriptions/success?session_id={CHECKOUT_SESSION_ID}";
const STRIPE_DEFAULT_CANCEL_URL =
  "http://localhost:4000/api/v1/subscriptions/cancel?session_id={CHECKOUT_SESSION_ID}";

const getStripeClient = () => {
  if (!config.stripe_secret_key) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Stripe secret key is not configured",
    );
  }

  return new Stripe(config.stripe_secret_key);
};

const getUserByEmail = async (email: string) => {
  const user = await User.findOne({ email }).select("_id email role");
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  return user;
};

const getBillingInterval = (durationDays: number) => {
  if (durationDays % 365 === 0) {
    return {
      interval: BillingInterval.YEAR,
      intervalCount: durationDays / 365,
    };
  }

  if (durationDays % 30 === 0) {
    return {
      interval: BillingInterval.MONTH,
      intervalCount: durationDays / 30,
    };
  }

  if (durationDays % 7 === 0) {
    return {
      interval: BillingInterval.WEEK,
      intervalCount: durationDays / 7,
    };
  }

  return {
    interval: BillingInterval.DAY,
    intervalCount: durationDays,
  };
};

const toCents = (price: number) => Math.round(price * 100);

const getDefaultSuccessUrl = () =>
  config.stripe_success_url || STRIPE_DEFAULT_SUCCESS_URL;

const getDefaultCancelUrl = () =>
  config.stripe_cancel_url || STRIPE_DEFAULT_CANCEL_URL;

const expireSubscriptionIfNeeded = async (subscription: ISubscription) => {
  if (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.expiryDate < new Date()
  ) {
    subscription.status = SubscriptionStatus.EXPIRED;
    subscription.autoRenew = false;
    await (
      subscription as unknown as { save: () => Promise<ISubscription> }
    ).save();
    return true;
  }

  return false;
};

const createPlan = async (
  payload: ISubscriptionPlan,
  createdByEmail?: string,
): Promise<ISubscriptionPlan> => {
  const existing = await SubscriptionPlan.findOne({ name: payload.name });
  if (existing) {
    throw new AppError(httpStatus.CONFLICT, "Plan already exists");
  }

  const stripe = getStripeClient();
  const currency = (
    payload.currency ||
    config.stripe_currency ||
    "usd"
  ).toLowerCase();
  const billing = getBillingInterval(payload.durationDays);

  const product = await stripe.products.create({
    name: payload.name,
    metadata: {
      durationDays: String(payload.durationDays),
      billingInterval: billing.interval,
      billingIntervalCount: String(billing.intervalCount),
      currency,
    },
  });

  const price = await stripe.prices.create({
    product: product.id,
    currency,
    unit_amount: toCents(payload.price),
    recurring: {
      interval: billing.interval,
      interval_count: billing.intervalCount,
    },
    metadata: {
      planName: payload.name,
      durationDays: String(payload.durationDays),
    },
  });

  let createdById;
  if (createdByEmail) {
    const user = await getUserByEmail(createdByEmail);
    createdById = user._id;
  }

  const plan = await SubscriptionPlan.create({
    ...payload,
    currency,
    billingInterval: billing.interval,
    billingIntervalCount: billing.intervalCount,
    stripeProductId: product.id,
    stripePriceId: price.id,
    createdBy: createdById,
  });

  return plan;
};

const listPlans = async (): Promise<ISubscriptionPlan[]> => {
  return SubscriptionPlan.find({ isActive: true }).sort({ price: 1 });
};

const getLatestActiveSubscription = async (userId: string) => {
  return Subscription.findOne({
    user: userId,
    status: SubscriptionStatus.ACTIVE,
  }).sort({ createdAt: -1 });
};

const getLatestPendingSubscription = async (userId: string, planId: string) => {
  return Subscription.findOne({
    user: userId,
    plan: planId,
    status: SubscriptionStatus.PENDING,
  }).sort({ createdAt: -1 });
};

const purchaseSubscription = async (
  email: string,
  planId: string,
  autoRenew: boolean,
): Promise<IStripeCheckoutResult> => {
  const user = await getUserByEmail(email);

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan || !plan.isActive) {
    throw new AppError(httpStatus.NOT_FOUND, "Plan not found");
  }

  if (!plan.stripePriceId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Stripe price is not configured for this plan",
    );
  }

  const activeSubscription = await getLatestActiveSubscription(
    user._id.toString(),
  );

  if (activeSubscription) {
    const expired = await expireSubscriptionIfNeeded(activeSubscription);
    if (!expired) {
      const isSamePlan =
        activeSubscription.plan.toString() === plan._id.toString();
      if (isSamePlan) {
        throw new AppError(
          httpStatus.CONFLICT,
          "Active subscription already exists for this plan",
        );
      }

      if (plan.price <= activeSubscription.price) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Only upgrades to higher-priced plans are allowed while a subscription is active",
        );
      }
    }
  }

  const pendingSubscription = await getLatestPendingSubscription(
    user._id.toString(),
    plan._id.toString(),
  );

  if (pendingSubscription) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A checkout session is already pending for this plan",
    );
  }

  const startDate = new Date();
  const expiryDate = new Date(
    startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000,
  );

  const localSubscription = await Subscription.create({
    user: user._id,
    plan: plan._id,
    planName: plan.name,
    price: plan.price,
    startDate,
    expiryDate,
    status: SubscriptionStatus.PENDING,
    autoRenew,
    provider: "stripe",
    stripePriceId: plan.stripePriceId,
    upgradedFrom: activeSubscription?._id,
  });

  const stripe = getStripeClient();
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    client_reference_id: localSubscription._id.toString(),
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: getDefaultSuccessUrl(),
    cancel_url: getDefaultCancelUrl(),
    metadata: {
      userId: user._id.toString(),
      subscriptionId: localSubscription._id.toString(),
      planId: plan._id.toString(),
      autoRenew: String(autoRenew),
      previousSubscriptionId: activeSubscription?._id.toString() || "",
    },
    subscription_data: {
      metadata: {
        userId: user._id.toString(),
        subscriptionId: localSubscription._id.toString(),
        planId: plan._id.toString(),
        autoRenew: String(autoRenew),
        previousSubscriptionId: activeSubscription?._id.toString() || "",
      },
    },
  });

  if (!checkoutSession.url) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Stripe checkout URL was not generated",
    );
  }

  await Subscription.findByIdAndUpdate(localSubscription._id, {
    stripeCheckoutSessionId: checkoutSession.id,
  });

  const subscription =
    (await Subscription.findById(localSubscription._id)) || localSubscription;

  return {
    subscription,
    checkoutSessionId: checkoutSession.id,
    checkoutUrl: checkoutSession.url,
  };
};

const cancelSubscription = async (
  email: string,
  subscriptionId?: string,
): Promise<ISubscription> => {
  const user = await getUserByEmail(email);

  const query = subscriptionId
    ? { _id: subscriptionId, user: user._id }
    : { user: user._id, status: SubscriptionStatus.ACTIVE };

  const subscription = await Subscription.findOne(query);
  if (!subscription) {
    throw new AppError(httpStatus.NOT_FOUND, "Active subscription not found");
  }

  if (subscription.status === SubscriptionStatus.EXPIRED) {
    throw new AppError(httpStatus.BAD_REQUEST, "Subscription already expired");
  }

  if (subscription.status === SubscriptionStatus.PENDING) {
    subscription.status = SubscriptionStatus.CANCELED;
    subscription.canceledAt = new Date();
    subscription.autoRenew = false;
    await subscription.save();
    return subscription;
  }

  const stripe = getStripeClient();
  if (subscription.stripeSubscriptionId) {
    await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
  }

  subscription.status = SubscriptionStatus.CANCELED;
  subscription.canceledAt = new Date();
  subscription.autoRenew = false;
  await subscription.save();

  return subscription;
};

const getMySubscription = async (
  email: string,
): Promise<ISubscription | null> => {
  const user = await getUserByEmail(email);

  const subscription = await Subscription.findOne({ user: user._id })
    .sort({ createdAt: -1 })
    .populate(
      "plan",
      "name price durationDays currency billingInterval billingIntervalCount",
    );

  if (!subscription) {
    return null;
  }

  await expireSubscriptionIfNeeded(subscription);
  return subscription;
};

const saveProcessedWebhookEvent = async (
  event: any,
  subscriptionId?: string,
) => {
  try {
    await ProcessedWebhookEvent.create({
      provider: "stripe",
      eventId: event.id,
      eventType: event.type,
      subscriptionId,
      processedAt: new Date(),
      payload: event.data.object as Record<string, unknown>,
    });
    return true;
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      return false;
    }

    throw error;
  }
};

const findSubscriptionByStripeSubscriptionId = async (
  stripeSubscriptionId: string,
) => {
  return Subscription.findOne({ stripeSubscriptionId });
};

const markPreviousSubscriptionAsUpgraded = async (
  previousSubscriptionId: string | undefined,
) => {
  if (!previousSubscriptionId) {
    return;
  }

  const previousSubscription = await Subscription.findById(
    previousSubscriptionId,
  );
  if (!previousSubscription) {
    return;
  }

  if (previousSubscription.status === SubscriptionStatus.ACTIVE) {
    previousSubscription.status = SubscriptionStatus.UPGRADED;
    previousSubscription.canceledAt = new Date();
    previousSubscription.autoRenew = false;
    await previousSubscription.save();
  }
};

const activatePendingSubscription = async (
  localSubscription: ISubscription,
  stripeSubscription: any,
  previousSubscriptionId?: string,
) => {
  localSubscription.status = SubscriptionStatus.ACTIVE;
  localSubscription.stripeSubscriptionId = stripeSubscription.id;
  localSubscription.stripeCustomerId =
    typeof stripeSubscription.customer === "string"
      ? stripeSubscription.customer
      : stripeSubscription.customer.id;
  localSubscription.expiryDate = new Date(
    stripeSubscription.current_period_end * 1000,
  );
  localSubscription.startDate = new Date(
    stripeSubscription.current_period_start * 1000,
  );
  localSubscription.autoRenew = !stripeSubscription.cancel_at_period_end;
  await (localSubscription as any).save();
  if (
    previousSubscriptionId &&
    previousSubscriptionId !== (localSubscription as any)._id?.toString()
  ) {
    await markPreviousSubscriptionAsUpgraded(previousSubscriptionId);
  }
  return localSubscription;
};

const syncFromStripeSubscription = async (stripeSubscription: any) => {
  const localSubscription = await findSubscriptionByStripeSubscriptionId(
    stripeSubscription.id,
  );

  if (!localSubscription) {
    return null;
  }

  localSubscription.stripeCustomerId =
    typeof stripeSubscription.customer === "string"
      ? stripeSubscription.customer
      : stripeSubscription.customer.id;
  localSubscription.expiryDate = new Date(
    stripeSubscription.current_period_end * 1000,
  );
  localSubscription.autoRenew = !stripeSubscription.cancel_at_period_end;

  if (stripeSubscription.status === "active") {
    localSubscription.status = SubscriptionStatus.ACTIVE;
  } else if (stripeSubscription.status === "past_due") {
    localSubscription.status = SubscriptionStatus.PAST_DUE;
    localSubscription.autoRenew = false;
  } else if (stripeSubscription.status === "canceled") {
    localSubscription.status = SubscriptionStatus.CANCELED;
    localSubscription.canceledAt = new Date();
    localSubscription.autoRenew = false;
  }

  await localSubscription.save();
  return localSubscription;
};

const handleStripeWebhook = async (signature: string, rawBody: Buffer) => {
  if (!config.stripe_webhook_secret) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Stripe webhook secret is not configured",
    );
  }

  const stripe = getStripeClient();
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    config.stripe_webhook_secret,
  );

  const alreadyProcessed = await saveProcessedWebhookEvent(event);
  if (!alreadyProcessed) {
    return {
      handled: false,
      eventType: event.type,
      subscription: null,
    };
  }

  if (event.type === "checkout.session.completed") {
    const session: any = event.data.object;
    const localSubscriptionId =
      session.metadata?.subscriptionId || session.client_reference_id;
    if (!localSubscriptionId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Checkout session is missing local subscription reference",
      );
    }

    const localSubscription = await Subscription.findById(localSubscriptionId);
    if (!localSubscription) {
      throw new AppError(httpStatus.NOT_FOUND, "Local subscription not found");
    }

    if (!session.subscription) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Stripe subscription ID is missing from checkout session",
      );
    }

    if (session.payment_status && session.payment_status !== "paid") {
      return {
        handled: true,
        eventType: event.type,
        subscription: localSubscription,
      };
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id,
    );
    const updatedSubscription = await activatePendingSubscription(
      localSubscription,
      stripeSubscription,
      session.metadata?.previousSubscriptionId,
    );

    // Ensure final state is ACTIVE after activation routine
    if (updatedSubscription) {
      updatedSubscription.status = SubscriptionStatus.ACTIVE;
      await (updatedSubscription as any).save();
    }

    return {
      handled: true,
      eventType: event.type,
      subscription: updatedSubscription,
    };
  }

  if (event.type === "invoice.paid") {
    const invoice: any = event.data.object;
    if (!invoice.subscription) {
      return {
        handled: true,
        eventType: event.type,
        subscription: null,
      };
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(
      typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription.id,
    );
    const localSubscription =
      await syncFromStripeSubscription(stripeSubscription);

    return {
      handled: true,
      eventType: event.type,
      subscription: localSubscription,
    };
  }

  if (event.type === "invoice.payment_failed") {
    const invoice: any = event.data.object;
    if (!invoice.subscription) {
      return {
        handled: true,
        eventType: event.type,
        subscription: null,
      };
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(
      typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription.id,
    );
    const localSubscription =
      await syncFromStripeSubscription(stripeSubscription);

    if (localSubscription) {
      localSubscription.status = SubscriptionStatus.PAST_DUE;
      localSubscription.autoRenew = false;
      await localSubscription.save();
    }

    return {
      handled: true,
      eventType: event.type,
      subscription: localSubscription,
    };
  }

  if (event.type === "customer.subscription.updated") {
    const stripeSubscription: any = event.data.object;
    const localSubscription =
      await syncFromStripeSubscription(stripeSubscription);

    return {
      handled: true,
      eventType: event.type,
      subscription: localSubscription,
    };
  }

  if (event.type === "customer.subscription.deleted") {
    const stripeSubscription: any = event.data.object;
    const localSubscription =
      await syncFromStripeSubscription(stripeSubscription);

    if (localSubscription) {
      localSubscription.status = SubscriptionStatus.CANCELED;
      localSubscription.canceledAt = new Date();
      localSubscription.autoRenew = false;
      await localSubscription.save();
    }

    return {
      handled: true,
      eventType: event.type,
      subscription: localSubscription,
    };
  }

  return {
    handled: true,
    eventType: event.type,
    subscription: null,
  };
};

export const SubscriptionServices = {
  createPlan,
  listPlans,
  purchaseSubscription,
  cancelSubscription,
  getMySubscription,
  handleStripeWebhook,
  // For backend redirects when frontend is absent
  handleCheckoutSuccess: async (sessionId: string) => {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId as any);

    const localSubscriptionId =
      session.metadata?.subscriptionId || session.client_reference_id;
    if (!localSubscriptionId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Checkout session is missing local subscription reference",
      );
    }

    const localSubscription = await Subscription.findById(localSubscriptionId);
    if (!localSubscription) {
      throw new AppError(httpStatus.NOT_FOUND, "Local subscription not found");
    }

    if (!session.subscription) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Stripe subscription ID is missing from checkout session",
      );
    }

    // retrieve stripe subscription and activate locally
    const stripeSubscription = await stripe.subscriptions.retrieve(
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id,
    );

    const updated = await activatePendingSubscription(
      localSubscription,
      stripeSubscription,
      session.metadata?.previousSubscriptionId,
    );

    if (updated) {
      updated.status = SubscriptionStatus.ACTIVE;
      await (updated as any).save();
    }

    return updated;
  },
  handleCheckoutCancel: async (sessionId: string) => {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId as any);

    const localSubscriptionId =
      session.metadata?.subscriptionId || session.client_reference_id;
    if (!localSubscriptionId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Checkout session is missing local subscription reference",
      );
    }

    const localSubscription = await Subscription.findById(localSubscriptionId);
    if (!localSubscription) {
      throw new AppError(httpStatus.NOT_FOUND, "Local subscription not found");
    }

    // Mark pending subscription as canceled
    if (localSubscription.status === SubscriptionStatus.PENDING) {
      localSubscription.status = SubscriptionStatus.CANCELED;
      localSubscription.canceledAt = new Date();
      localSubscription.autoRenew = false;
      await (localSubscription as any).save();
    }

    return localSubscription;
  },
};
