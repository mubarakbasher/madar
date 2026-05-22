import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bootTestApp, type BootedTestApp } from "../helpers/app";

describe("Welcome email on signup", () => {
  let booted: BootedTestApp;
  const dir = path.resolve(__dirname, "..", "var", "test-emails-welcome");

  beforeAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    process.env.EMAIL_LOG_DIR = dir;
    booted = await bootTestApp();
  });
  afterAll(async () => {
    await booted.app.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes a welcome email .eml file after a successful signup", async () => {
    const email = `welcome-${randomUUID().slice(0, 6)}@example.test`;
    const slug = `welcome-${randomUUID().slice(0, 6)}`;
    const res = await request(booted.http)
      .post("/v1/auth/signup")
      .set("Idempotency-Key", randomUUID())
      .send({
        business_name: "Welcome Test Cafe",
        owner_name: "Ahmed",
        email,
        password: "Password123!",
        slug,
        country_code: "EG",
        default_currency_code: "EGP",
        default_locale: "en",
        accept_terms: true,
      });
    expect(res.status).toBe(201);

    // Allow the fire-and-forget email handler a tick to land.
    await new Promise((r) => setTimeout(r, 200));

    const files = await fs.readdir(dir).catch(() => []);
    // Filenames look like `<ts>-<template>-<email-local>.eml`. The local-part
    // of the test email already contains "welcome", so filename matching can be
    // ambiguous between the welcome + email_verification emails that signup
    // now fires. Open each candidate and pick the one whose template header
    // actually reads "welcome".
    const candidates = files.filter((f) => f.includes(email.split("@")[0]!));
    expect(candidates.length).toBeGreaterThan(0);
    let welcomeContents: string | null = null;
    for (const f of candidates) {
      const c = await fs.readFile(path.join(dir, f), "utf8");
      if (c.includes("X-Madar-Template: welcome\n") || c.includes("X-Madar-Template: welcome\r\n")) {
        welcomeContents = c;
        break;
      }
    }
    expect(welcomeContents).not.toBeNull();
    expect(welcomeContents!).toContain("Welcome Test Cafe");
    expect(welcomeContents!).toContain("Ahmed");
  });
});
