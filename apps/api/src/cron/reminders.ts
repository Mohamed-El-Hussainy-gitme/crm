import cron from "node-cron";
import { prisma } from "../lib/prisma.js";

export function registerReminderJobs() {
  cron.schedule("*/15 * * * *", async () => {
    const now = new Date();

    await prisma.paymentInstallment.updateMany({
      where: {
        status: "PENDING",
        dueDate: { lt: now },
      },
      data: {
        status: "OVERDUE",
      },
    });

    const dueSoonTasks = await prisma.task.findMany({
      where: {
        status: "PENDING",
        dueAt: {
          lte: new Date(Date.now() + 30 * 60000),
          gte: now,
        },
      },
    });

    if (dueSoonTasks.length) {
      console.log(`[reminders] tasks due soon: ${dueSoonTasks.length}`);
    }
  });
}
