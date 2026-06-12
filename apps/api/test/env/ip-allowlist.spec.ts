import { describe, expect, it } from "vitest";
import { isIpAllowed } from "../../src/common/ip-allowlist";

describe("isIpAllowed (admin IP allowlist)", () => {
  it("empty allowlist allows everything (feature off)", () => {
    expect(isIpAllowed("203.0.113.7", [])).toBe(true);
  });

  it("exact IPv4 match", () => {
    expect(isIpAllowed("203.0.113.7", ["203.0.113.7"])).toBe(true);
    expect(isIpAllowed("203.0.113.8", ["203.0.113.7"])).toBe(false);
  });

  it("IPv4-mapped IPv6 form matches its IPv4 entry", () => {
    expect(isIpAllowed("::ffff:203.0.113.7", ["203.0.113.7"])).toBe(true);
  });

  it("CIDR match", () => {
    expect(isIpAllowed("10.1.2.3", ["10.1.0.0/16"])).toBe(true);
    expect(isIpAllowed("10.2.0.1", ["10.1.0.0/16"])).toBe(false);
    expect(isIpAllowed("192.168.1.1", ["0.0.0.0/0"])).toBe(true);
  });

  it("exact IPv6 match; unknown shapes never match", () => {
    expect(isIpAllowed("2001:db8::1", ["2001:db8::1"])).toBe(true);
    expect(isIpAllowed("2001:db8::2", ["2001:db8::1"])).toBe(false);
    expect(isIpAllowed("garbage", ["10.0.0.0/8"])).toBe(false);
  });

  it("mixed entries: any match wins", () => {
    const entries = ["10.0.0.0/8", "203.0.113.7", "2001:db8::1"];
    expect(isIpAllowed("10.9.9.9", entries)).toBe(true);
    expect(isIpAllowed("203.0.113.7", entries)).toBe(true);
    expect(isIpAllowed("198.51.100.1", entries)).toBe(false);
  });
});
