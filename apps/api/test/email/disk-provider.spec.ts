import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DiskEmailProvider } from "../../src/common/email/disk.provider";

describe("DiskEmailProvider", () => {
  const dir = path.resolve(
    __dirname,
    "..",
    "var",
    "test-emails-disk-provider",
  );
  const provider = new DiskEmailProvider();

  beforeAll(async () => {
    process.env.EMAIL_LOG_DIR = dir;
    await fs.rm(dir, { recursive: true, force: true });
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes an .eml file with subject + body and returns a message id", async () => {
    const to = `t-${randomUUID().slice(0, 6)}@example.test`;
    const { id } = await provider.send({
      to,
      from: "Test <noreply@madar.dev>",
      subject: "Hello World",
      html: "<p>HTML body</p>",
      text: "TEXT body",
      template: "welcome",
      locale: "en",
    });
    expect(id).toEqual(expect.any(String));
    const files = await fs.readdir(dir);
    const match = files.find((f) => f.includes("welcome") && f.includes(to.split("@")[0]!));
    expect(match).toBeTruthy();
    const contents = await fs.readFile(path.join(dir, match!), "utf8");
    expect(contents).toContain("Subject: Hello World");
    expect(contents).toContain("TEXT body");
    expect(contents).toContain("<p>HTML body</p>");
    expect(contents).toContain("X-Madar-Template: welcome");
    expect(contents).toContain("X-Madar-Locale: en");
  });
});
