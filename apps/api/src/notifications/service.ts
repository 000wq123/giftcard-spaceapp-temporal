import {
  NOTIFICATION_SOURCE_LABELS, eventSchema, notificationChannelEnabled, notificationRaiseInputSchema, resolveNotificationSettings,
  type Event, type NotificationListQuery, type NotificationRaiseInput, type NotificationSource, type NotificationStatus, type NotificationStreamPayload, type PushDeviceRegistration, type SpaceNotification, type UserSettings
} from "@space/contracts";
import type { SpaceNotificationsRepository } from "@space/db";
import { makeSpaceId, type SpaceEventBus } from "@space/runtime";
import type { FcmSender } from "./fcm.js";

export interface NotificationServiceDeps {
  repository: SpaceNotificationsRepository;
  eventBus: Pick<SpaceEventBus, "publish">;
  /** The owner's settings decide the channels; `suppressNotifications` silences every pop-up and Telegram. */
  userSettings(userId: string): Promise<UserSettings>;
  /** Room events are kept (and replayed) by the store; notifications outside a room only travel the live bus. */
  recordRoomEvent(input: Omit<Event, "id" | "createdAt" | "workflowId">): Promise<Event>;
  /** FCM pushes to the owner's Android devices; absent when no service account key is configured (dev). */
  push?: FcmSender | null;
  /**
   * Nous, the mind of SpaceApp (operator decision 2026-10-17): while it is on and working, what needs the operator reaches
   * Nous first and their phone only through Nous's own decisions; anything urgent still goes out.
   */
  nous?: { held(owner: string): Promise<boolean>; raised(notification: SpaceNotification): void };
  log?: { warn(meta: Record<string, unknown>, message: string): void };
  now?(): string;
}

/** Kept for 30 days, then pruned (read or not). */
export const NOTIFICATION_RETENTION_MS = 30 * 24 * 3_600_000;

export function createNotificationService(deps: NotificationServiceDeps) {
  const now = deps.now ?? (() => new Date().toISOString());

  function payloadOf(notification: SpaceNotification): NotificationStreamPayload {
    return { notificationId: notification.id, ownerUserId: notification.ownerUserId, source: notification.source, kind: notification.kind, severity: notification.severity,
      status: notification.status, roomId: notification.roomId, paneId: notification.paneId };
  }
  async function publish(type: "NOTIFICATION_CREATED" | "NOTIFICATION_UPDATED", notification: SpaceNotification) {
    const base = { roomId: notification.roomId ?? "", paneId: notification.paneId, turnId: null, workflowId: null, traceId: `notification:${notification.id}`, type,
      message: `${NOTIFICATION_SOURCE_LABELS[notification.source]}: ${notification.kind}`.slice(0, 1000), payload: payloadOf(notification) as unknown as Record<string, unknown> };
    try {
      // Ids only on the shared stream: every signed-in user receives every event; the owner reads the record through the API.
      if (notification.roomId) deps.eventBus.publish(await deps.recordRoomEvent({ ...base, roomId: notification.roomId }));
      else deps.eventBus.publish(eventSchema.parse({ ...base, id: makeSpaceId("event"), roomId: null, createdAt: now() }));
    } catch (error) {
      deps.log?.warn({ err: error, notificationId: notification.id }, "Notification event could not be published.");
    }
  }

  async function sendPush(push: FcmSender, notification: SpaceNotification) {
    const data = { notificationId: notification.id, title: `${NOTIFICATION_SOURCE_LABELS[notification.source]}: ${notification.title}`, body: notification.body.slice(0, 240) };
    for (const token of await deps.repository.pushTokens(notification.ownerUserId)) {
      const result = await push.send(token, data).catch((error: unknown) => { deps.log?.warn({ err: error, notificationId: notification.id }, "Notification push failed."); return "FAILED" as const; });
      if (result === "INVALID_TOKEN") await deps.repository.disablePushDevice(token);
    }
  }

  return {
    /** Records the notification (or refreshes the open one with its dedupe key), publishes it, queues Telegram and pushes to the owner's devices when the owner wants it. */
    async raise(rawInput: NotificationRaiseInput): Promise<SpaceNotification> {
      const input = notificationRaiseInputSchema.parse(rawInput);
      const { notification, created } = await deps.repository.raise(input);
      await publish(created ? "NOTIFICATION_CREATED" : "NOTIFICATION_UPDATED", notification);
      if (created) {
        const settings = await deps.userSettings(input.ownerUserId).catch(() => null);
        const channels = resolveNotificationSettings(settings?.notifications);
        const held = input.severity === "ATTENTION" && input.source !== "NOUS" && Boolean(await deps.nous?.held(input.ownerUserId).catch(() => false));
        const telegram = !held && (input.telegram ?? (notificationChannelEnabled(channels, input.source, "telegram") && input.severity !== "INFO"));
        if (telegram && !settings?.suppressNotifications) {
          await deps.repository.enqueueTelegram(notification, { source: NOTIFICATION_SOURCE_LABELS[notification.source] })
            .catch((error) => deps.log?.warn({ err: error, notificationId: notification.id }, "Notification Telegram enqueue failed."));
        }
        // Like Telegram: what needs the user, per the channel and source switches; the producer's Telegram override is Telegram's own.
        if (deps.push && !held && !settings?.suppressNotifications && input.severity !== "INFO" && notificationChannelEnabled(channels, input.source, "push")) {
          void sendPush(deps.push, notification).catch((error: unknown) => deps.log?.warn({ err: error, notificationId: notification.id }, "Notification push failed."));
        }
        deps.nous?.raised(notification);
      }
      return notification;
    },
    get: (owner: string, id: string) => deps.repository.get(owner, id),
    pushAvailable: () => Boolean(deps.push),
    registerPushDevice: (owner: string, device: PushDeviceRegistration) => deps.repository.registerPushDevice(owner, device),
    removePushDevice: (owner: string, token: string) => deps.repository.removePushDevice(owner, token),
    list: (owner: string, query: NotificationListQuery) => deps.repository.list(owner, query),
    pending: (owner: string) => deps.repository.pending(owner),
    unresolvedBySource: (source: NotificationSource) => deps.repository.unresolvedBySource(source),
    async setStatus(owner: string, id: string, status: Exclude<NotificationStatus, "OPEN">): Promise<SpaceNotification | null> {
      const updated = await deps.repository.setStatus(owner, id, status);
      if (updated) await publish("NOTIFICATION_UPDATED", updated);
      return updated;
    },
    async readAll(owner: string): Promise<number> {
      const count = await deps.repository.readAll(owner);
      if (count) {
        const latest = (await deps.repository.list(owner, { status: "ALL", limit: 1 }))[0];
        if (latest) await publish("NOTIFICATION_UPDATED", latest);
      }
      return count;
    },
    /** A question answered or a thread handled resolves its open notification. */
    async resolve(owner: string, dedupeKey: string): Promise<number> {
      const count = await deps.repository.resolveByDedupeKey(owner, dedupeKey);
      if (count) {
        const latest = (await deps.repository.list(owner, { status: "ALL", limit: 1 }))[0];
        if (latest) await publish("NOTIFICATION_UPDATED", latest);
      }
      return count;
    },
    prune: () => deps.repository.prune(new Date(Date.parse(now()) - NOTIFICATION_RETENTION_MS).toISOString())
  };
}
export type NotificationService = ReturnType<typeof createNotificationService>;
