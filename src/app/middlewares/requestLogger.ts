import pino from "pino";
import pinoHttp from "pino-http";
import { NextFunction, Request, Response } from "express";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const httpLogger = pinoHttp({ logger });

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // attach pino-http to request/response
  httpLogger(req as any, res as any);
  next();
};

export default requestLogger;
