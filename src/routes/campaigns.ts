import { Router } from "express";
import { prisma } from "../lib/prisma";
import { messageQueue } from "../queue/message.queue";
const router = Router();

/**
 * Create a campaign
 */
router.post("/", async (req, res) => {
  try {
    const { name, message } = req.body;

    if (!name || !message) {
      return res.status(400).json({
        error: "name and message are required",
      });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        message,
      },
    });

    res.status(201).json(campaign);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create campaign",
    });
  }
});

/**
 * Add contacts to a campaign
 */
router.post("/:campaignId/contacts", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        error: "contacts array is required",
      });
    }

    const campaign = await prisma.campaign.findUnique({
      where: {
        id: campaignId,
      },
    });

    if (!campaign) {
      return res.status(404).json({
        error: "Campaign not found",
      });
    }

    const result = await prisma.contact.createMany({
      data: contacts.map((contact) => ({
        campaignId,
        name: contact.name || null,
        phone: contact.phone,
      })),
      skipDuplicates: true,
    });

    res.status(201).json({
      added: result.count,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to add contacts",
    });
  }
});

/**
 * Get campaign details
 */

router.post("/:campaignId/start", async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: {
        id: campaignId,
      },
      include: {
        contacts: {
          where: {
            optedOut: false,
          },
        },
      },
    });

    if (!campaign) {
      return res.status(404).json({
        error: "Campaign not found",
      });
    }

    if (campaign.status !== "DRAFT") {
      return res.status(400).json({
        error: `Campaign cannot be started from ${campaign.status}`,
      });
    }

    if (campaign.contacts.length === 0) {
      return res.status(400).json({
        error: "Campaign has no contacts",
      });
    }

    // Create one database message per contact.
    // upsert makes this safe against duplicate creation.
    const messages = await Promise.all(
      campaign.contacts.map((contact) =>
        prisma.message.upsert({
          where: {
            campaignId_contactId: {
              campaignId,
              contactId: contact.id,
            },
          },
          update: {},
          create: {
            campaignId,
            contactId: contact.id,
            status: "QUEUED",
          },
        })
      )
    );

    // Mark campaign as running
    await prisma.campaign.update({
      where: {
        id: campaignId,
      },
      data: {
        status: "RUNNING",
      },
    });

    // Push message jobs into Redis/BullMQ
    await messageQueue.addBulk(
      messages.map((message) => ({
        name: "send-message",
        data: {
          messageId: message.id,
        },
        opts: {
          jobId: message.id,
        },
      }))
    );

    return res.json({
      success: true,
      campaignId,
      queued: messages.length,
    });
  } catch (error) {
    console.error("START CAMPAIGN ERROR:", error);

    return res.status(500).json({
      error: "Failed to start campaign",
    });
  }
});
router.get("/:campaignId", async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: {
        id: campaignId,
      },
      include: {
        _count: {
          select: {
            contacts: true,
            messages: true,
          },
        },
      },
    });

    if (!campaign) {
      return res.status(404).json({
        error: "Campaign not found",
      });
    }

    const statusCounts = await prisma.message.groupBy({
      by: ["status"],
      where: {
        campaignId,
      },
      _count: {
        status: true,
      },
    });

    const stats = {
      QUEUED: 0,
      PROCESSING: 0,
      SENT: 0,
      DELIVERED: 0,
      READ: 0,
      FAILED: 0,
    };

    for (const item of statusCounts) {
      stats[item.status] = item._count.status;
    }

    return res.json({
      ...campaign,
      stats,
    });
  } catch (error) {
    console.error("GET CAMPAIGN ERROR:", error);

    return res.status(500).json({
      error: "Failed to fetch campaign",
    });
  }
});
router.post("/:campaignId/pause", async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return res.status(404).json({
        error: "Campaign not found",
      });
    }

    if (campaign.status !== "RUNNING") {
      return res.status(400).json({
        error: `Cannot pause campaign from ${campaign.status}`,
      });
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "PAUSED" },
    });

    return res.json({
      success: true,
      campaignId,
      status: "PAUSED",
    });
  } catch (error) {
    console.error("PAUSE CAMPAIGN ERROR:", error);

    return res.status(500).json({
      error: "Failed to pause campaign",
    });
  }
});
router.post("/:campaignId/pause", async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return res.status(404).json({
        error: "Campaign not found",
      });
    }

    if (campaign.status !== "RUNNING") {
      return res.status(400).json({
        error: `Cannot pause campaign from ${campaign.status}`,
      });
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "PAUSED" },
    });

    return res.json({
      success: true,
      campaignId,
      status: "PAUSED",
    });
  } catch (error) {
    console.error("PAUSE CAMPAIGN ERROR:", error);

    return res.status(500).json({
      error: "Failed to pause campaign",
    });
  }
});

export default router;
