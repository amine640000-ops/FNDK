import { Injectable, OnModuleInit } from "@nestjs/common";
import { dbQuery, getOne, subscribeToEvents } from "@nevo/shared-infra";
import type { RabbitEventMap } from "@nevo/shared-types";
import type { SendNotificationDto } from "./notification.dto";

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

@Injectable()
export class NotificationService implements OnModuleInit {
  async onModuleInit() {
    await subscribeToEvents("notification-service", {
      "user.registered": async ({ userId, fullName }: RabbitEventMap["user.registered"]) => {
        await this.insertNotification(userId, "Welcome to FNDK", `Your account for ${fullName} is pending email verification.`);
      },
      "deposit.confirmed": async ({ userId, amount, asset }: RabbitEventMap["deposit.confirmed"]) => {
        await this.insertNotification(userId, "Deposit confirmed", `${amount} ${asset} has been approved and activated.`);
      },
      "withdrawal.approved": async ({ userId, amount, asset }: RabbitEventMap["withdrawal.approved"]) => {
        await this.insertNotification(userId, "Withdrawal approved", `${amount} ${asset} is queued for settlement.`);
      },
      "profit.distributed": async ({ userId, profit, strategy }: RabbitEventMap["profit.distributed"]) => {
        await this.insertNotification(userId, "Profit credited", `${profit.toFixed(2)} USD was credited from ${strategy}.`);
      },
      "vip.upgraded": async ({ userId, nextTierId }: RabbitEventMap["vip.upgraded"]) => {
        const tier = await getOne<{ name: string }>("SELECT name FROM vip_tiers WHERE id = $1", [nextTierId]);
        await this.insertNotification(userId, "VIP upgraded", `Your account moved to ${tier?.name ?? "a new tier"}.`);
      }
    });
  }

  async list(userId: string) {
    const result = await dbQuery<NotificationRow>(
      `
        SELECT
          id,
          user_id,
          title,
          message,
          is_read,
          created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [userId]
    );

    return result.rows.map((notification: NotificationRow) => ({
      id: notification.id,
      userId: notification.user_id,
      title: notification.title,
      message: notification.message,
      isRead: notification.is_read,
      createdAt: notification.created_at
    }));
  }

  async send(dto: SendNotificationDto) {
    if (dto.userId) {
      const inserted = await this.insertNotification(dto.userId, dto.title, dto.message);
      return {
        ...inserted,
        channel: ["socket", "email"]
      };
    }

    const users = await dbQuery<{ id: string }>("SELECT id FROM users WHERE role = 'USER' AND is_active = TRUE");
    const notifications = [];
    for (const user of users.rows) {
      notifications.push(await this.insertNotification(user.id, dto.title, dto.message));
    }

    return {
      audience: "all-users",
      delivered: notifications.length,
      channel: ["socket", "email", "broadcast"]
    };
  }

  async markRead(userId: string, notificationId?: string) {
    if (notificationId) {
      const result = await dbQuery(
        `
          UPDATE notifications
          SET is_read = TRUE
          WHERE user_id = $1 AND id = $2
        `,
        [userId, notificationId]
      );

      return {
        updated: result.rowCount ?? 0
      };
    }

    const result = await dbQuery(
      `
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = $1 AND is_read = FALSE
      `,
      [userId]
    );

    return {
      updated: result.rowCount ?? 0
    };
  }

  private async insertNotification(userId: string, title: string, message: string) {
    const result = await getOne<NotificationRow>(
      `
        INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
        RETURNING id, user_id, title, message, is_read, created_at
      `,
      [userId, title, message]
    );

    return {
      id: result!.id,
      userId: result!.user_id,
      title: result!.title,
      message: result!.message,
      isRead: result!.is_read,
      createdAt: result!.created_at
    };
  }
}
