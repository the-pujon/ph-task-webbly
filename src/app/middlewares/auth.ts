import { NextFunction, Request, Response } from "express";
import AppError from "../errors/AppError";
import httpStatus from "http-status";
import jwt, {
  JsonWebTokenError,
  JwtPayload,
  TokenExpiredError,
} from "jsonwebtoken";
import { getCachedData } from "../utils/redis.utils";
import config from "../config";
import { User } from "../modules/Auth/auth.model";
import catchAsync from "../utils/catchAsync";

export const auth = (
  ...requiredRoles: (
    | "admin"
    | "moderator"
    | "superAdmin"
    | "customer"
    | "seller"
  )[]
) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.accessToken;

    // console.log("here is the token", token)

    if (!token) {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        "You are not authorized. Login first",
      );
    }

    // 🔐 Validate secret before using
    if (!config.jwt_access_secret) {
      console.error("❌ JWT_ACCESS_SECRET is missing in config.ts or .env");
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Server error: JWT secret is not configured",
      );
    }

    try {
      const decoded = jwt.verify(token, config.jwt_access_secret) as JwtPayload;
      const { email, role } = decoded;

      const cachedToken = await getCachedData(
        `${config.redis_cache_key_prefix}:user:${email}:accessToken`,
      );

      if (cachedToken !== token) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Token is not valid");
      }

      const user = await User.isUserExistsByEmail(email);
      if (!user) {
        throw new AppError(httpStatus.NOT_FOUND, "This user is not found!");
      }

      if (requiredRoles.length && !requiredRoles.includes(role)) {
        throw new AppError(httpStatus.UNAUTHORIZED, "You have no access");
      }

      req.user = decoded;
      next();
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new AppError(
          httpStatus.UNAUTHORIZED,
          "Your session has expired. Please login again.",
        );
      } else if (error instanceof JsonWebTokenError) {
        throw new AppError(
          httpStatus.UNAUTHORIZED,
          "Invalid token. Please login again.",
        );
      }
      throw error;
    }
  });
};
