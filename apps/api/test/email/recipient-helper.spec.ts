import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPrisma } from "@madar/db";
import { getTenantPrimaryRecipient } from "../../src/common/email/recipient.helper";
import { makeTenant } from "../helpers/fixtures";

describe("getTenantPrimaryRecipient", () => {
  let tenantId: string;
  let secondaryOwnerId: string;

  beforeAll(async () => {
    const t = await makeTenant({ slugPrefix: "recipient-test", emailPrefix: "owner-a" });
    tenantId = t.tenantId;
    // Create a second active owner created later — helper should NOT pick this one.
    const second = await adminPrisma.user.create({
      data: {
        tenant_id: tenantId,
        email: `owner-b-${randomUUID().slice(0, 6)}@example.test`,
        password_hash: "x",
        name: "Second Owner",
        role: "owner",
        locale: "ar",
        is_active: true,
        created_at: new Date(Date.now() + 60_000),
      },
    });
    secondaryOwnerId = second.id;
  });
  afterAll(async () => {
    // cleanup is fine for the single-spec process
  });

  it("returns the earliest-created active owner", async () => {
    const r = await getTenantPrimaryRecipient(tenantId);
    expect(r).not.toBeNull();
    expect(r!.user_id).not.toBe(secondaryOwnerId);
    expect(r!.email).toContain("owner-a");
    expect(r!.locale).toBe("en");
  });

  it("skips soft-deleted owners", async () => {
    // Soft-delete the first owner; helper should fall back to the second.
    await adminPrisma.user.updateMany({
      where: { tenant_id: tenantId, email: { contains: "owner-a" } },
      data: { deleted_at: new Date() },
    });
    const r = await getTenantPrimaryRecipient(tenantId);
    expect(r).not.toBeNull();
    expect(r!.user_id).toBe(secondaryOwnerId);
    expect(r!.locale).toBe("ar");
  });

  it("returns null when no active owner exists", async () => {
    const orphan = await makeTenant({ slugPrefix: "orphan-test", emailPrefix: "ghost" });
    await adminPrisma.user.update({
      where: { id: orphan.userId },
      data: { is_active: false },
    });
    const r = await getTenantPrimaryRecipient(orphan.tenantId);
    expect(r).toBeNull();
  });
});
