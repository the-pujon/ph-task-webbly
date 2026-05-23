import { z } from "zod";

const userValidationZodSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, { message: "Name is required" }) // Ensure the name is not empty
      .max(50, { message: "Name must be less than 50 characters" }) // Optional max length
      .regex(/^[a-zA-Z\s]+$/, {
        message: "Name must only contain letters and spaces",
      }),
    email: z.string().email({ message: "Invalid email address" }),
    phone: z
      .string()
      .length(11, { message: "Phone number must be exactly 11 digits" })
      .regex(/^\d+$/, { message: "Phone number must contain only digits" }),
    password: z
      .string()
      .min(5, { message: "Password must be at least 5 characters" }),
  }),
});

const loginValidationSchema = z.object({
  body: z.object({
    email: z.string().email({ message: "Invalid email address" }),
    password: z.string().min(1, { message: "Password is required" }),
  }),
});
const resendVerifyEmailCode = z.object({
  body: z.object({
    email: z.string().email({ message: "Invalid email address" }),
  }),
});

export const AuthValidation = {
  userValidationZodSchema,
  loginValidationSchema,
  resendVerifyEmailCode,
};
