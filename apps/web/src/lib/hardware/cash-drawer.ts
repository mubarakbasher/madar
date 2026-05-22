"use client";
/**
 * Cash-drawer WebUSB helper.
 *
 * Talks to a paired thermal receipt printer and sends the ESC/POS pulse
 * command (0x1B 0x70 0x00 0x19 0xFF) that fires the drawer's RJ11 kick.
 *
 * WebUSB requires:
 *   - HTTPS (or http://localhost during dev)
 *   - Chrome/Edge (Firefox doesn't ship WebUSB)
 *   - One-time user permission grant per device
 *
 * Fall-back: cashiers without WebUSB or without pairing rely on the printer's
 * DIP-switch auto-kick on cash receipt — documented in
 * docs/operations/hardware-setup.md.
 */

// USB vendor IDs of the printers we know how to talk to. Each line is a
// (vendor, friendly-name) pair surfaced in the device-picker dialog.
const KNOWN_PRINTERS: USBDeviceFilter[] = [
  { vendorId: 0x0519 }, // Star Micronics
  { vendorId: 0x04b8 }, // Seiko Epson
];

// ESC/POS "generate pulse" command. Bytes:
//   0x1B 0x70 — ESC p (generate pulse)
//   0x00      — connector 1 (most drawers; some use 0x01 for connector 2)
//   0x19      — on-time = 25 × 2ms = 50ms
//   0xFF      — off-time = 255 × 2ms = 510ms (long enough to fully open)
const KICK_BYTES = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xff]);

export type CashDrawerStatus =
  | "unsupported" // WebUSB API missing (Firefox, Safari)
  | "ready" // Paired device available
  | "needs_pairing" // Supported browser but no device paired
  | "error";

export interface CashDrawerState {
  status: CashDrawerStatus;
  detail?: string;
}

function isWebUsbAvailable(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

/**
 * Detect a previously-paired thermal printer the user has already granted
 * access to. Returns null when none has been paired or when WebUSB is not
 * available.
 */
export async function findPairedPrinter(): Promise<USBDevice | null> {
  if (!isWebUsbAvailable()) return null;
  try {
    const devices = await navigator.usb.getDevices();
    for (const device of devices) {
      if (KNOWN_PRINTERS.some((f) => f.vendorId === device.vendorId)) {
        return device;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Prompt the user to pair a printer. First-click in the UI should call this.
 * Throws if the user cancels the picker.
 */
export async function pairPrinter(): Promise<USBDevice> {
  if (!isWebUsbAvailable()) {
    throw new Error("WebUSB not supported");
  }
  return navigator.usb.requestDevice({ filters: KNOWN_PRINTERS });
}

/**
 * Send the kick pulse to the paired printer. Opens the device + claims the
 * first bulk-out endpoint, writes 5 bytes, releases.
 *
 * Returns on success; throws with a code string describing failure modes:
 *   - `no_printer`  — nothing paired
 *   - `no_endpoint` — printer doesn't expose a bulk-out endpoint we can write to
 *   - `usb_error`   — the underlying transferOut threw
 */
export async function popDrawer(device?: USBDevice): Promise<void> {
  const target = device ?? (await findPairedPrinter());
  if (!target) throw new Error("no_printer");

  try {
    if (!target.opened) await target.open();
    if (target.configuration === null) await target.selectConfiguration(1);

    // Claim the first bulk-out endpoint across all interfaces.
    let chosen: { iface: number; endpoint: number } | null = null;
    for (const iface of target.configuration?.interfaces ?? []) {
      for (const alt of iface.alternates) {
        for (const ep of alt.endpoints) {
          if (ep.direction === "out" && ep.type === "bulk") {
            chosen = { iface: iface.interfaceNumber, endpoint: ep.endpointNumber };
            break;
          }
        }
        if (chosen) break;
      }
      if (chosen) break;
    }
    if (!chosen) throw new Error("no_endpoint");

    await target.claimInterface(chosen.iface);
    try {
      await target.transferOut(chosen.endpoint, KICK_BYTES);
    } finally {
      try {
        await target.releaseInterface(chosen.iface);
      } catch {
        /* best-effort */
      }
    }
  } catch (e) {
    if (e instanceof Error && (e.message === "no_printer" || e.message === "no_endpoint")) {
      throw e;
    }
    throw new Error("usb_error");
  }
}

export function getCashDrawerStatus(): CashDrawerStatus {
  return isWebUsbAvailable() ? "needs_pairing" : "unsupported";
}
