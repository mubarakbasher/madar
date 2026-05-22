import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { _resetDb, MadarOfflineDB, getDb } from "./db";

beforeEach(async () => {
  _resetDb();
  await new MadarOfflineDB().delete();
  _resetDb();
});

describe("MadarOfflineDB", () => {
  it("opens cleanly and exposes the three tables", async () => {
    const db = getDb();
    await db.open();
    expect(db.name).toBe("madar_offline_v1");
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      "catalog_snapshot",
      "outbox_proofs",
      "outbox_sales",
    ]);
  });

  it("indexes outbox_sales by status, [tenant_id+status], client_uuid, created_at", async () => {
    const db = getDb();
    await db.open();
    const schema = db.outbox_sales.schema;
    const indexNames = schema.indexes.map((i) => i.name);
    expect(indexNames).toContain("status");
    expect(indexNames).toContain("[tenant_id+status]");
    expect(indexNames).toContain("client_uuid");
    expect(indexNames).toContain("created_at");
    expect(schema.primKey.name).toBe("id");
  });

  it("indexes catalog_snapshot by synced_at and outbox_proofs by sale_uuid", async () => {
    const db = getDb();
    await db.open();
    const cat = db.catalog_snapshot.schema.indexes.map((i) => i.name);
    expect(cat).toContain("synced_at");
    const proofs = db.outbox_proofs.schema.indexes.map((i) => i.name);
    expect(proofs).toContain("sale_uuid");
    expect(proofs).toContain("status");
    expect(proofs).toContain("created_at");
  });
});
