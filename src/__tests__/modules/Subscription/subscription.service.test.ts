import httpStatus from "http-status";
import AppError from "../../../app/errors/AppError";
import { User } from "../../../app/modules/Auth/auth.model";
import {
  BillingInterval,
  SubscriptionStatus,
} from "../../../app/modules/Subscription/subscription.interface";
import { SubscriptionServices } from "../../../app/modules/Subscription/subscription.service";
import {
  Subscription,
  SubscriptionPlan,
} from "../../../app/modules/Subscription/subscription.model";
import { ProcessedWebhookEvent } from "../../../app/modules/Subscription/webhookEvent.model";

const mockProductsCreate = jest.fn();
const mockPricesCreate = jest.fn();
const mockCheckoutCreate = jest.fn();
const mockSubscriptionsCancel = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockConstructEvent = jest.fn();

const stripeMock = {
  products: {
    create: mockProductsCreate,
  },
  prices: {
    create: mockPricesCreate,
  },
  checkout: {
    sessions: {
      create: mockCheckoutCreate,
    },
  },
  subscriptions: {
    cancel: mockSubscriptionsCancel,
    retrieve: mockSubscriptionsRetrieve,
  },
  webhooks: {
    constructEvent: mockConstructEvent,
  },
};

jest.mock("stripe", () => ({
  __esModule: true,
  default: jest.fn(() => stripeMock),
}));

jest.mock("../../../app/config", () => ({
  __esModule: true,
  default: {
    stripe_secret_key: "sk_test_123",
    stripe_webhook_secret: "whsec_test_123",
    stripe_currency: "usd",
    stripe_success_url:
      "http://localhost:3000/subscription/success?session_id={CHECKOUT_SESSION_ID}",
    stripe_cancel_url:
      "http://localhost:3000/subscription/cancel?session_id={CHECKOUT_SESSION_ID}",
  },
}));

jest.mock("../../../app/modules/Auth/auth.model");
jest.mock("../../../app/modules/Subscription/subscription.model", () => ({
  SubscriptionPlan: {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
  },
  Subscription: {
    findOne: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock("../../../app/modules/Subscription/webhookEvent.model", () => ({
  ProcessedWebhookEvent: {
    create: jest.fn(),
  },
}));

const mockUser = {
  _id: "user-id",
  email: "user@example.com",
  role: "customer",
};

const mockPlan = {
  _id: "plan-id",
  name: "Starter",
  price: 10,
  durationDays: 30,
  currency: "usd",
  billingInterval: BillingInterval.MONTH,
  billingIntervalCount: 1,
  isActive: true,
  stripePriceId: "price_123",
  stripeProductId: "prod_123",
};

const mockUserQuery = (user: typeof mockUser | null) => {
  (User.findOne as jest.Mock).mockReturnValue({
    select: jest.fn().mockResolvedValue(user),
  });
};

describe("SubscriptionServices", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockProductsCreate.mockResolvedValue({ id: "prod_123" });
    mockPricesCreate.mockResolvedValue({ id: "price_123" });
    mockCheckoutCreate.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/pay/cs_test_123",
    });
    mockSubscriptionsCancel.mockResolvedValue({});
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_stripe_123",
      customer: "cus_123",
      current_period_end: 1893456000,
      current_period_start: 1890864000,
      status: "active",
      cancel_at_period_end: false,
      metadata: {
        subscriptionId: "local-sub-id",
        previousSubscriptionId: "",
      },
    });
    mockConstructEvent.mockReturnValue({
      id: "evt_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          subscription: "sub_stripe_123",
          payment_status: "paid",
          client_reference_id: "local-sub-id",
          metadata: {
            subscriptionId: "local-sub-id",
            previousSubscriptionId: "prev-sub-id",
          },
        },
      },
    });

    (ProcessedWebhookEvent.create as jest.Mock).mockResolvedValue({});
  });

  describe("createPlan", () => {
    it("creates Stripe product, Stripe price, and local plan", async () => {
      (SubscriptionPlan.findOne as jest.Mock).mockResolvedValue(null);
      (SubscriptionPlan.create as jest.Mock).mockResolvedValue(mockPlan);
      mockUserQuery(mockUser);

      const result = await SubscriptionServices.createPlan({
        name: mockPlan.name,
        price: mockPlan.price,
        durationDays: mockPlan.durationDays,
        currency: "usd",
        isActive: true,
      } as never, mockUser.email);

      expect(mockProductsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: mockPlan.name }),
      );
      expect(mockPricesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          product: "prod_123",
          currency: "usd",
          unit_amount: 1000,
        }),
      );
      expect(SubscriptionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeProductId: "prod_123",
          stripePriceId: "price_123",
          billingInterval: BillingInterval.MONTH,
          billingIntervalCount: 1,
        }),
      );
      expect(result).toEqual(mockPlan);
    });
  });

  describe("purchaseSubscription", () => {
    it("throws when user not found", async () => {
      mockUserQuery(null);

      await expect(
        SubscriptionServices.purchaseSubscription(
          "missing@example.com",
          "plan-id",
          false,
        ),
      ).rejects.toThrow(new AppError(httpStatus.NOT_FOUND, "User not found"));
    });

    it("throws when plan not found", async () => {
      mockUserQuery(mockUser);
      (SubscriptionPlan.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        SubscriptionServices.purchaseSubscription(
          mockUser.email,
          "plan-id",
          false,
        ),
      ).rejects.toThrow(new AppError(httpStatus.NOT_FOUND, "Plan not found"));
    });

    it("prevents purchasing the same active plan again", async () => {
      mockUserQuery(mockUser);
      (SubscriptionPlan.findById as jest.Mock).mockResolvedValue(mockPlan);

      const activeSubscription = {
        _id: "active-sub-id",
        plan: { toString: () => mockPlan._id },
        price: mockPlan.price,
        status: SubscriptionStatus.ACTIVE,
        expiryDate: new Date(Date.now() + 1000 * 60 * 60),
        save: jest.fn(),
      };

      (Subscription.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockResolvedValue(activeSubscription),
      });

      await expect(
        SubscriptionServices.purchaseSubscription(
          mockUser.email,
          mockPlan._id,
          true,
        ),
      ).rejects.toThrow(
        new AppError(
          httpStatus.CONFLICT,
          "Active subscription already exists for this plan",
        ),
      );
    });

    it("creates a Stripe checkout session for upgrades", async () => {
      mockUserQuery(mockUser);
      const upgradePlan = {
        ...mockPlan,
        _id: "plan-pro",
        name: "Pro",
        price: 25,
        stripePriceId: "price_pro_123",
      };

      (SubscriptionPlan.findById as jest.Mock).mockResolvedValue(upgradePlan);

      const activeSubscription = {
        _id: "active-sub-id",
        plan: { toString: () => mockPlan._id },
        price: mockPlan.price,
        status: SubscriptionStatus.ACTIVE,
        expiryDate: new Date(Date.now() + 1000 * 60 * 60),
        save: jest.fn(),
      };

      (Subscription.findOne as jest.Mock).mockReturnValue({
        sort: jest
          .fn()
          .mockResolvedValueOnce(activeSubscription)
          .mockResolvedValueOnce(null),
      });

      const createdSubscription = {
        _id: "local-sub-id",
        status: SubscriptionStatus.PENDING,
      };

      (Subscription.create as jest.Mock).mockResolvedValue(createdSubscription);
      (Subscription.findByIdAndUpdate as jest.Mock).mockResolvedValue({
        ...createdSubscription,
        stripeCheckoutSessionId: "cs_test_123",
      });
      (Subscription.findById as jest.Mock).mockResolvedValue({
        ...createdSubscription,
        stripeCheckoutSessionId: "cs_test_123",
      });

      const result = await SubscriptionServices.purchaseSubscription(
        mockUser.email,
        upgradePlan._id,
        true,
      );

      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "subscription",
          customer_email: mockUser.email,
          line_items: [{ price: upgradePlan.stripePriceId, quantity: 1 }],
        }),
      );
      expect(result.checkoutSessionId).toBe("cs_test_123");
      expect(result.checkoutUrl).toContain("checkout.stripe.com");
      expect(result.subscription.status).toBe(SubscriptionStatus.PENDING);
    });
  });

  describe("cancelSubscription", () => {
    it("cancels an active Stripe subscription", async () => {
      mockUserQuery(mockUser);
      const subscription = {
        _id: "local-sub-id",
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: "sub_stripe_123",
        autoRenew: true,
        save: jest.fn().mockResolvedValue(undefined),
      };

      (Subscription.findOne as jest.Mock).mockResolvedValue(subscription);

      const result = await SubscriptionServices.cancelSubscription(
        mockUser.email,
      );

      expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_stripe_123");
      expect(subscription.save).toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.CANCELED);
    });
  });

  describe("handleStripeWebhook", () => {
    it("activates a pending subscription on checkout completion", async () => {
      const pendingSubscription = {
        _id: "local-sub-id",
        status: SubscriptionStatus.PENDING,
        price: 25,
        autoRenew: true,
        save: jest.fn().mockResolvedValue(undefined),
      };

      (Subscription.findById as jest.Mock).mockResolvedValue(pendingSubscription);
      (Subscription.findByIdAndUpdate as jest.Mock).mockResolvedValue(pendingSubscription);
      (Subscription.findOne as jest.Mock).mockResolvedValue(null);

      const result = await SubscriptionServices.handleStripeWebhook(
        "stripe-signature",
        Buffer.from(JSON.stringify({})),
      );

      expect(mockConstructEvent).toHaveBeenCalled();
      expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_stripe_123");
      expect(pendingSubscription.save).toHaveBeenCalled();
      expect(result.handled).toBe(true);
      expect(result.subscription?.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it("ignores duplicate webhook events", async () => {
      (ProcessedWebhookEvent.create as jest.Mock).mockRejectedValue({ code: 11000 });
      const result = await SubscriptionServices.handleStripeWebhook(
        "stripe-signature",
        Buffer.from(JSON.stringify({})),
      );

      expect(result.handled).toBe(false);
    });
  });
});
