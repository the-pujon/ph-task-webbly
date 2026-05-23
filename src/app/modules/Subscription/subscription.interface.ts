import { Types } from "mongoose";

export enum SubscriptionStatus {
  PENDING = "pending",
  ACTIVE = "active",
  CANCELED = "canceled",
  EXPIRED = "expired",
  UPGRADED = "upgraded",
  PAST_DUE = "past_due",
}

export enum BillingInterval {
  DAY = "day",
  WEEK = "week",
  MONTH = "month",
  YEAR = "year",
}

export interface ISubscriptionPlan {
  name: string;
  price: number;
  durationDays: number;
  currency: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  stripeProductId?: string;
  stripePriceId?: string;
}

export interface ISubscription {
  user: Types.ObjectId;
  plan: Types.ObjectId;
  planName: string;
  price: number;
  startDate: Date;
  expiryDate: Date;
  status: SubscriptionStatus;
  autoRenew: boolean;
  provider: "stripe";
  stripeCustomerId?: string;
  stripeCheckoutSessionId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  canceledAt?: Date;
  upgradedFrom?: Types.ObjectId;
}

export interface IStripeCheckoutResult {
  subscription: ISubscription;
  checkoutSessionId: string;
  checkoutUrl: string;
}
