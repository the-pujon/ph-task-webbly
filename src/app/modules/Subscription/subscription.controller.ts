import httpStatus from "http-status";
import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import AppError from "../../errors/AppError";
import { SubscriptionServices } from "./subscription.service";

const createPlan = catchAsync(async (req: Request, res: Response) => {
  const plan = await SubscriptionServices.createPlan(req.body, req.user?.email);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Subscription plan created successfully",
    data: plan,
  });
});

const listPlans = catchAsync(async (_req: Request, res: Response) => {
  const plans = await SubscriptionServices.listPlans();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription plans retrieved successfully",
    data: plans,
  });
});

const purchaseSubscription = catchAsync(async (req: Request, res: Response) => {
  const { planId, autoRenew } = req.body;
  const email = req.user?.email;

  if (!email) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "User email not found in token",
    );
  }

  const result = await SubscriptionServices.purchaseSubscription(
    email,
    planId,
    Boolean(autoRenew),
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Stripe checkout session created successfully",
    data: result,
  });
});

const cancelSubscription = catchAsync(async (req: Request, res: Response) => {
  const { subscriptionId } = req.body;
  const email = req.user?.email;

  if (!email) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "User email not found in token",
    );
  }

  const subscription = await SubscriptionServices.cancelSubscription(
    email,
    subscriptionId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription canceled successfully",
    data: subscription,
  });
});

const getMySubscription = catchAsync(async (req: Request, res: Response) => {
  const email = req.user?.email;

  if (!email) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "User email not found in token",
    );
  }

  const subscription = await SubscriptionServices.getMySubscription(email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription retrieved successfully",
    data: subscription,
  });
});

const handleWebhook = catchAsync(async (req: Request, res: Response) => {
  const signature = (req.headers["stripe-signature"] as string) || "";

  if (!signature) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Stripe signature header is required",
    );
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body || {}));

  const result = await SubscriptionServices.handleStripeWebhook(
    signature,
    rawBody,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Webhook processed successfully",
    data: result,
  });
});

const handleCheckoutSuccess = catchAsync(
  async (req: Request, res: Response) => {
    const sessionId =
      (req.query.session_id as string) || (req.query.sessionId as string);
    if (!sessionId) {
      throw new AppError(httpStatus.BAD_REQUEST, "session_id is required");
    }

    const subscription =
      await SubscriptionServices.handleCheckoutSuccess(sessionId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Checkout success processed",
      data: subscription,
    });
  },
);

const handleCheckoutCancel = catchAsync(async (req: Request, res: Response) => {
  const sessionId =
    (req.query.session_id as string) || (req.query.sessionId as string);
  if (!sessionId) {
    throw new AppError(httpStatus.BAD_REQUEST, "session_id is required");
  }

  const subscription =
    await SubscriptionServices.handleCheckoutCancel(sessionId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Checkout cancel processed",
    data: subscription,
  });
});

export const SubscriptionControllers = {
  createPlan,
  listPlans,
  purchaseSubscription,
  cancelSubscription,
  getMySubscription,
  handleWebhook,
  handleCheckoutSuccess,
  handleCheckoutCancel,
};
