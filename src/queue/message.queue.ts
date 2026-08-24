import { Queue } from "bullmq";
import { redisConnection } from "./connection";

export interface MessageJobData {
  messageId: string;
}

export const MESSAGE_QUEUE_NAME = "whatsapp-messages";

export const messageQueue = new Queue<MessageJobData>(MESSAGE_QUEUE_NAME, {
  connection: redisConnection,

  defaultJobOptions: {
    attempts: 3,

    backoff: {
      type: "exponential",
      delay: 2000,
    },

    removeOnComplete: {
      count: 1000,
    },

    removeOnFail: false,
  },
});
