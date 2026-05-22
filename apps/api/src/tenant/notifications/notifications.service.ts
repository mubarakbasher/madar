import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
// Cron handler uses adminPrisma to check preferences without a tenant JWT —
// crons run outside tenant context. Per-tenant reads from the tenant service
// stay scoped via tenantScoped.
// eslint-disable-next-line no-restricted-imports
import { adminPrisma, tenantScoped } from "@madar/db";
import { AuditService, type AuditCtx } from "../auth/audit.service";
import {
  CHANNELS,
  EVENT_TYPES,
  type NotificationChannel,
  type NotificationEventType,
  type UpdatePreferencesInput,
} from "./dto/update-preferences.dto";

export interface NotificationPreferenceRow {
  event_type: NotificationEventType;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationPreferenceMatrix {
  // { [event_type]: { email: boolean; in_app: boolean } }
  preferences: Record<
    NotificationEventType,
    Record<NotificationChannel, boolean>
  >;
}

const READ_ROLES = new Set(["owner", "manager"]);
const WRITE_ROLES = new Set(["owner", "manager"]);

// Module-local in-memory cache (per process). Keyed by `${tenantId}:${event}:${channel}`.
// TTL 60s. Invalidated immediately on PATCH.
interface CacheEntry {
  value: boolean;
  expires: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(tenantId: string, event: string, channel: string): string {
  return `${tenantId}:${event}:${channel}`;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly audit: AuditService) {}

  // ─── matrix read (auto-seeds defaults on first access) ───────────────

  async getMatrix(
    tenantId: string,
    role: string,
  ): Promise<NotificationPreferenceMatrix> {
    if (!READ_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers can view notification preferences",
      });
    }

    const scoped = tenantScoped(tenantId);
    let rows = (await scoped.notificationPreference.findMany({
      select: { event_type: true, channel: true, enabled: true },
    })) as NotificationPreferenceRow[];

    // First-time seed: insert defaults for missing (event, channel) pairs.
    const need: Array<{ event_type: NotificationEventType; channel: NotificationChannel }> = [];
    for (const event_type of EVENT_TYPES) {
      for (const channel of CHANNELS) {
        if (!rows.some((r) => r.event_type === event_type && r.channel === channel)) {
          need.push({ event_type, channel });
        }
      }
    }
    if (need.length > 0) {
      await scoped.notificationPreference.createMany({
        data: need.map((n) => ({
          tenant_id: tenantId,
          event_type: n.event_type,
          channel: n.channel,
          enabled: true,
        })),
        skipDuplicates: true,
      });
      rows = (await scoped.notificationPreference.findMany({
        select: { event_type: true, channel: true, enabled: true },
      })) as NotificationPreferenceRow[];
    }

    return this.shape(rows);
  }

  // ─── matrix write ────────────────────────────────────────────────────

  async updateMatrix(
    tenantId: string,
    role: string,
    input: UpdatePreferencesInput,
    ctx: AuditCtx,
  ): Promise<NotificationPreferenceMatrix> {
    if (!WRITE_ROLES.has(role)) {
      throw new ForbiddenException({
        code: "forbidden_role",
        message: "Only owners and managers can edit notification preferences",
      });
    }

    const scoped = tenantScoped(tenantId);

    // Ensure rows exist (re-uses getMatrix's seed logic without returning).
    await this.getMatrix(tenantId, role);

    const updates: Array<{
      event_type: NotificationEventType;
      channel: NotificationChannel;
      enabled: boolean;
    }> = [];
    for (const event_type of EVENT_TYPES) {
      const slice = input[event_type];
      if (!slice) continue;
      for (const channel of CHANNELS) {
        const v = slice[channel];
        if (typeof v === "boolean") {
          updates.push({ event_type, channel, enabled: v });
        }
      }
    }

    if (updates.length > 0) {
      // Batched updateMany — each combo is a unique pair so we can run them
      // in parallel.
      await Promise.all(
        updates.map((u) =>
          scoped.notificationPreference.updateMany({
            where: {
              tenant_id: tenantId,
              event_type: u.event_type,
              channel: u.channel,
            },
            data: { enabled: u.enabled },
          }),
        ),
      );

      // Invalidate cache for the touched keys.
      for (const u of updates) {
        cache.delete(cacheKey(tenantId, u.event_type, u.channel));
      }

      await this.audit
        .writeTenantScoped(ctx, {
          action: "notification_prefs_updated",
          entity: "tenant",
          entityId: tenantId,
          after: { changes: updates },
        })
        .catch((e) =>
          this.logger.warn(`audit write failed: ${(e as Error).message}`),
        );
    }

    return this.getMatrix(tenantId, role);
  }

  // ─── cron-side gate (used by senders) ────────────────────────────────

  /**
   * Cheap "is this notification enabled?" lookup with a 60s in-memory cache.
   * Default behaviour when no row exists (e.g., first-ever query before
   * any user has opened /settings/notifications): assume `true` so existing
   * tenants don't lose alerts during the rollout.
   */
  async isEventEnabled(
    tenantId: string,
    eventType: NotificationEventType,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const key = cacheKey(tenantId, eventType, channel);
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

    // adminPrisma — cron-time, no tenant JWT.
    const row = await adminPrisma.notificationPreference.findUnique({
      where: {
        tenant_id_event_type_channel: {
          tenant_id: tenantId,
          event_type: eventType,
          channel,
        },
      },
      select: { enabled: true },
    });
    const enabled = row?.enabled ?? true; // default-on for un-seeded tenants
    cache.set(key, { value: enabled, expires: Date.now() + CACHE_TTL_MS });
    return enabled;
  }

  // ─── helpers ─────────────────────────────────────────────────────────

  private shape(rows: NotificationPreferenceRow[]): NotificationPreferenceMatrix {
    const out: NotificationPreferenceMatrix["preferences"] = Object.fromEntries(
      EVENT_TYPES.map((e) => [e, { email: true, in_app: true }]),
    ) as NotificationPreferenceMatrix["preferences"];
    for (const r of rows) {
      out[r.event_type][r.channel] = r.enabled;
    }
    return { preferences: out };
  }
}
