import { z } from "zod";

const createPlanSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    price: z.number().nonnegative(),
    durationDays: z.number().int().min(1),
    currency: z.string().min(3).max(3).optional(),
    isActive: z.boolean().optional(),
  }),
});

const purchaseSubscriptionSchema = z.object({
  body: z.object({
    planId: z.string().min(1),
    autoRenew: z.boolean().optional(),
  }),
});

const cancelSubscriptionSchema = z.object({
  body: z.object({
    subscriptionId: z.string().optional(),
  }),
});

export const SubscriptionValidation = {
  createPlanSchema,
  purchaseSubscriptionSchema,
  cancelSubscriptionSchema,
};
