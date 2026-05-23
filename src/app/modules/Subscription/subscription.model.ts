import { Schema, model } from "mongoose";
import {
  BillingInterval,
  ISubscription,
  ISubscriptionPlan,
  SubscriptionStatus,
} from "./subscription.interface";

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    name: {
      type: String,
      required: [true, "Plan name is required"],
      trim: true,
      unique: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price must be positive"],
    },
    durationDays: {
      type: Number,
      required: [true, "Duration days is required"],
      min: [1, "Duration must be at least 1 day"],
    },
    currency: {
      type: String,
      required: [true, "Currency is required"],
      default: "usd",
      lowercase: true,
      trim: true,
    },
    billingInterval: {
      type: String,
      enum: Object.values(BillingInterval),
      required: true,
    },
    billingIntervalCount: {
      type: Number,
      required: true,
      min: [1, "Billing interval count must be at least 1"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    stripeProductId: {
      type: String,
      index: true,
    },
    stripePriceId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

subscriptionPlanSchema.index({ price: 1 });

const subscriptionSchema = new Schema<ISubscription>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    plan: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },
    planName: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: [0, "Price must be positive"],
    },
    startDate: {
      type: Date,
      required: true,
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.PENDING,
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },
    provider: {
      type: String,
      enum: ["stripe"],
      default: "stripe",
    },
    stripeCustomerId: {
      type: String,
      index: true,
    },
    stripeCheckoutSessionId: {
      type: String,
      index: true,
      sparse: true,
    },
    stripeSubscriptionId: {
      type: String,
      index: true,
      sparse: true,
    },
    stripePriceId: {
      type: String,
      index: true,
    },
    canceledAt: {
      type: Date,
    },
    upgradedFrom: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
    },
  },
  {
    timestamps: true,
  },
);

subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ user: 1, plan: 1, status: 1 });

export const SubscriptionPlan = model<ISubscriptionPlan>(
  "SubscriptionPlan",
  subscriptionPlanSchema,
);
export const Subscription = model<ISubscription>(
  "Subscription",
  subscriptionSchema,
);
