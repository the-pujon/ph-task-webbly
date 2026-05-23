import { NextFunction, Request, Response } from "express";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on("finish", () => {
    logger.info(
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTime: Date.now() - start,
      },
      "request completed",
    );
  });

  next();
};

export default requestLogger;
