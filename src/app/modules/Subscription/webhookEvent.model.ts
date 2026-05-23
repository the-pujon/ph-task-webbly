import { Schema, model } from "mongoose";

export interface IProcessedWebhookEvent {
  provider: "stripe";
  eventId: string;
  eventType: string;
  subscriptionId?: string;
  processedAt: Date;
  payload: Record<string, unknown>;
}

const processedWebhookEventSchema = new Schema<IProcessedWebhookEvent>(
  {
    provider: {
      type: String,
      enum: ["stripe"],
      default: "stripe",
      required: true,
    },
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    subscriptionId: {
      type: String,
      index: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const ProcessedWebhookEvent = model<IProcessedWebhookEvent>(
  "ProcessedWebhookEvent",
  processedWebhookEventSchema,
);

export default ProcessedWebhookEvent;
