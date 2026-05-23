import { NextFunction, Request, Response } from "express";
import client from "prom-client";

client.collectDefaultMetrics();

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const httpRequestTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total count of HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

const getRouteLabel = (req: Request) =>
  req.baseUrl && req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;

const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const route = getRouteLabel(req);
  const endTimer = httpRequestDuration.startTimer();

  res.on("finish", () => {
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestTotal.inc(labels);
    endTimer(labels);
  });

  next();
};

const metricsHandler = async (_req: Request, res: Response) => {
  res.setHeader("Content-Type", client.register.contentType);
  res.send(await client.register.metrics());
};

export { metricsMiddleware, metricsHandler };
