import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { auth } from "../../middlewares/auth";
import { SubscriptionControllers } from "./subscription.controller";
import { SubscriptionValidation } from "./subscription.validation";

const router = express.Router();

router.post(
  "/plans",
  auth("admin", "superAdmin"),
  validateRequest(SubscriptionValidation.createPlanSchema),
  SubscriptionControllers.createPlan,
);

router.get("/plans", SubscriptionControllers.listPlans);

router.post(
  "/purchase",
  auth("customer", "admin", "superAdmin"),
  validateRequest(SubscriptionValidation.purchaseSubscriptionSchema),
  SubscriptionControllers.purchaseSubscription,
);

router.post(
  "/cancel",
  auth("customer", "admin", "superAdmin"),
  validateRequest(SubscriptionValidation.cancelSubscriptionSchema),
  SubscriptionControllers.cancelSubscription,
);

router.get(
  "/me",
  auth("customer", "admin", "superAdmin"),
  SubscriptionControllers.getMySubscription,
);

router.post("/webhook", SubscriptionControllers.handleWebhook);

// Backend-facing checkout result endpoints (no frontend)
router.get("/success", SubscriptionControllers.handleCheckoutSuccess);
router.get("/cancel", SubscriptionControllers.handleCheckoutCancel);

export const SubscriptionRoutes = router;
