import "dotenv/config";

import { Worker } from "bullmq";
import { prisma } from "../lib/prisma";
import { redisConnection } from "../queue/connection";
import { MESSAGE_QUEUE_NAME, MessageJobData } from "../queue/message.queue";

async function checkCampaignCompletion(campaignId: string) {
  const pendingCount = await prisma.message.count({
    where: {
      campaignId,
      status: {
        in: ["QUEUED", "PROCESSING"],
      },
    },
  });

  if (pendingCount === 0) {
    await prisma.campaign.update({
      where: {
        id: campaignId,
      },
      data: {
        status: "COMPLETED",
      },
    });

    console.log(`🎉 Campaign ${campaignId} completed`);
  }
}

const worker = new Worker<MessageJobData>(
  MESSAGE_QUEUE_NAME,

  async (job) => {
    const { messageId } = job.data;

    console.log(`\n📥 Processing message: ${messageId}`);

    const message = await prisma.message.findUnique({
      where: {
        id: messageId,
      },
      include: {
        contact: true,
        campaign: true,
      },
    });

    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    // Campaign was paused while this job was waiting
    if (message.campaign.status === "PAUSED") {
      console.log(
        `⏸️ Campaign ${message.campaignId} is paused. Delaying message ${messageId}`
      );

      // Put this job back into the queue
      await job.moveToDelayed(Date.now() + 5000, job.token);

      return;
    }

    // Don't process messages that were already completed
    if (
      message.status === "SENT" ||
      message.status === "DELIVERED" ||
      message.status === "READ"
    ) {
      console.log(`⏭️ Message already processed: ${messageId}`);
      return;
    }

    // Mark message as processing
    await prisma.message.update({
      where: {
        id: messageId,
      },
      data: {
        status: "PROCESSING",
        attempts: {
          increment: 1,
        },
      },
    });

    // Replace template variables
    const finalMessage = message.campaign.message.replace(
      "{{name}}",
      message.contact.name || ""
    );

    console.log(`
--------------------------------
📱 MOCK MESSAGE SEND

To: ${message.contact.phone}
Name: ${message.contact.name}
Message: ${finalMessage}
--------------------------------
`);

    // Simulate external API/network delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mark message as sent
    await prisma.message.update({
      where: {
        id: messageId,
      },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: `mock_${messageId}_${Date.now()}`,
      },
    });

    // Check whether this was the last pending message
    await checkCampaignCompletion(message.campaignId);

    console.log(`✅ SENT: ${message.contact.phone}`);
  },

  {
    connection: redisConnection,

    // One message at a time for controlled processing
    concurrency: 1,
  }
);

worker.on("completed", (job) => {
  console.log(`🏁 Job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(
    `❌ Job ${job?.id} failed after attempt ${job?.attemptsMade}:`,
    error.message
  );
});

console.log("🚀 WhatsApp message worker started");
