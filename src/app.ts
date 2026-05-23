import express, { Application, Request, Response } from "express";
import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import router from "./app/routes";
import globalErrorHandler from "./app/middlewares/globalErrorhandler";
import notFound from "./app/middlewares/notFound";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import requestLogger from "./app/middlewares/requestLogger";
import { metricsHandler, metricsMiddleware } from "./app/middlewares/metrics";

const app: Application = express();

app.use("/api/v1/subscriptions/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins =
  process.env.FRONTEND_URLS?.split(",").map((url) => url.trim()) || [];

app.use(
  cors({
    origin: (origin, callback) => {
      console.log("Request Origin:", origin);
      console.log("Allowed Origins:", allowedOrigins);

      if (!origin) {
        // Allow requests with no origin (e.g. mobile apps, curl)
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["set-cookie"],
  }),
);

app.use(cookieParser());

app.use(requestLogger);
app.use(metricsMiddleware);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
  standardHeaders: "draft-8", // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  // store: ... , // Redis, Memcached, etc. See below.
});

// Apply the rate limiting middleware to all requests.
app.use(limiter);
// application routes
app.use("/api/v1", router);

app.get("/metrics", metricsHandler);

app.get("/", (req: Request, res: Response) => {
  res.send("Hi Express Server v2!! you are live now!!!!");
});

app.use(globalErrorHandler);

//Not Found
app.use(notFound);

export default app;
