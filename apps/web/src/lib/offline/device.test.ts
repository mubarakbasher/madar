import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceUuid, getNextSequence } from "./device";

beforeEach(() => {
  if (typeof window !== "undefined") window.localStorage.clear();
});

describe("getDeviceUuid", () => {
  it("returns the same uuid across repeated calls", () => {
    const a = getDeviceUuid();
    const b = getDeviceUuid();
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("mints a uuid via crypto.randomUUID when missing", () => {
    const spy = vi.spyOn(crypto, "randomUUID");
    window.localStorage.removeItem("madar.device_uuid");
    const id = getDeviceUuid();
    expect(spy).toHaveBeenCalled();
    expect(window.localStorage.getItem("madar.device_uuid")).toBe(id);
    spy.mockRestore();
  });
});

describe("getNextSequence", () => {
  it("is monotonic and starts at 1", () => {
    expect(getNextSequence()).toBe(1);
    expect(getNextSequence()).toBe(2);
    expect(getNextSequence()).toBe(3);
  });

  it("persists the new value before returning so a crash cannot reuse a number", () => {
    getNextSequence();
    getNextSequence();
    expect(window.localStorage.getItem("madar.client_sequence")).toBe("2");
    expect(getNextSequence()).toBe(3);
    expect(window.localStorage.getItem("madar.client_sequence")).toBe("3");
  });

  it("recovers from a garbage value in storage", () => {
    window.localStorage.setItem("madar.client_sequence", "not-a-number");
    expect(getNextSequence()).toBe(1);
  });
});
