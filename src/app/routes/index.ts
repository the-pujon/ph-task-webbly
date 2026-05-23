import { Router } from "express";
import { AuthRoutes } from "../modules/Auth/auth.route";
import { SubscriptionRoutes } from "../modules/Subscription/subscription.route";

const router = Router();

const moduleRoutes = [
  {
    path: "/auth",
    route: AuthRoutes,
  },
  {
    path: "/subscriptions",
    route: SubscriptionRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
