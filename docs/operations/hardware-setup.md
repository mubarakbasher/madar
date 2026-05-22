# Hardware setup

Madar's POS sell screen drives the receipt printer through the browser's print
dialog and (optionally) talks to a cash drawer via WebUSB. For a real shop,
spend 10 minutes wiring this up before opening day. Most small cafés will set
DIP-switch auto-kick on the printer and never touch WebUSB.

## Receipt printers

Tested with: **Star Micronics TSP100/143**, **Epson TM-T20III / TM-T88VI**.

Any USB or LAN thermal printer that exposes itself as a system print queue
works — Madar uses `window.print()`, so whatever your OS sees as a printer,
the POS can drive.

### Page-size preset

Browser's print dialog needs the right paper size to avoid weird scaling:

| Receipt size | Browser paper size to choose |
|---|---|
| 80 mm thermal (most common) | "80mm × 297mm" custom, OR pick "Star Receipt" / "TM-T88" preset if your driver provides one |
| 58 mm thermal | "58mm × 297mm" custom |

Madar's receipt page sets `@page` margins to 0 and a width hint that matches
the URL query (`?size=80mm` default, `?size=58mm` switch button on the
receipt page) — most drivers honour it.

### Save the print dialog

In Chrome / Edge: open the receipt → `Ctrl+P` → set destination (your
printer) → tick "More settings" → set Margins=None, Scale=100%, paper size
as above. The browser remembers these on subsequent prints. **Don't tick
"Headers and footers"** — that adds the URL to the receipt.

## Cash drawer

The drawer pulse can come from two places:

### Path A — Printer auto-kick (recommended)

Most thermal printers have an RJ11/RJ12 cash-drawer port and a setting to
pulse it on every print. Once configured, **no Madar code touches the
drawer** — the printer driver fires the pulse the moment it accepts a
receipt for printing.

**Star TSP100/143:**
1. Install the Star Utility (Windows: `Star TSP100 Configuration`, macOS: same).
2. `Drawer 1` → set "Open drawer on cash receipt" or "Open drawer at start of receipt".
3. Save → restart printer.

**Epson TM-T20 / TM-T88:**
1. Install EpsonNet Config or use the printer's web admin (LAN models).
2. Look for `Cash Drawer Control` → set kick to "Drawer 1 Open" on receipt start.
3. Save → restart printer.

After setup, every receipt printed via `window.print()` automatically pulses
the drawer. Done.

### Path B — Browser-driven via WebUSB (when Path A isn't possible)

If your printer doesn't support auto-kick (or you want to pulse the drawer
without printing), Madar can talk to the printer over WebUSB and send the
ESC/POS pulse command `1B 70 00 19 FF` directly.

Requirements:
- HTTPS in production (WebUSB is gated to secure contexts).
- Chrome / Edge (Firefox does not yet support WebUSB).
- One-time user permission grant per device.

UX:
1. After ringing a cash sale → open the receipt page.
2. Click **Open drawer** button (visible only when WebUSB is available).
3. First-time click triggers Chrome's "Choose a USB device" dialog — pick the
   printer and click Connect.
4. Subsequent cash receipts auto-pop the drawer (no dialog).

Cashiers without WebUSB / without pairing fall back to Path A or open the
drawer manually with the key.

## Barcode scanner

Any USB barcode scanner in "HID/keyboard" mode works without configuration —
it emits keystrokes into whatever input has focus.

The POS search bar autofocuses on mount, so:

- Click anywhere in the POS sell screen → search bar grabs focus.
- Scan a barcode → barcode characters type into the search.
- The scanner appends an Enter at the end of the barcode → search submits → product is added to the cart.

If your scanner doesn't send Enter by default, configure it (most scanners
have a programming sheet — scan the "Add Enter suffix" barcode in the
manual).

For two-screen / kiosk setups, point the cashier at the POS URL and the
customer at a static "thank you" page. Customer-facing display is not yet
built into the app — out of scope.

## Network printing

LAN-attached thermal printers (Star TSP143LAN, Epson TM-T20III-L):

1. Assign a static IP via your router DHCP reservation.
2. Add the printer to the cashier's OS via "Add printer by IP" → use Raw / Port 9100.
3. Treat the rest the same as USB (page size, auto-kick, etc.).

## What's not built

- **Customer-facing display** (second screen showing the running total).
- **Scale integration** for weighed items (deli, fresh produce).
- **Card terminal integration** — Madar takes manual card approval codes only (`payment_method='card'` flow asks the cashier to type the terminal's approval code after the customer pays on the terminal).
- **Wireless thermal printers** over Bluetooth — only USB / LAN.
