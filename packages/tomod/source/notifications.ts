import crypto from "node:crypto";
import { createLogger } from "./logger.js";

const log = createLogger("notifications");

export type NotificationType = "info" | "warning" | "error" | "success";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

const MAX_NOTIFICATIONS = 100;

export class Notifications {
  private notifications: Notification[] = [];

  create(type: NotificationType, title: string, message: string): Notification {
    const notification: Notification = {
      id: crypto.randomUUID(),
      type,
      title,
      message,
      createdAt: new Date().toISOString(),
      read: false,
    };

    this.notifications = [notification, ...this.notifications].slice(
      0,
      MAX_NOTIFICATIONS,
    );

    log.info("Notification created", { type, title });
    return notification;
  }

  list(limit?: number): Notification[] {
    const items = [...this.notifications];
    return limit ? items.slice(0, limit) : items;
  }

  markRead(id: string): void {
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n,
    );
  }

  clear(): void {
    this.notifications = [];
    log.info("All notifications cleared");
  }
}
