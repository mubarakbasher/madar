"use client";

import { useTranslations } from "next-intl";
import { Pause, Plus, Minus, User, X } from "lucide-react";
import type { Product } from "@/lib/mock-data/products";
import { EmptyBasket } from "./EmptyBasket";

export type CartLine = {
  id: string;
  qty: number;
  discount: number;
  note: string;
};

export type CartLineEx = CartLine & {
  p: Product;
  price: number;
};

export type CartCustomer = {
  id: string;
  name: string;
  visits: number;
  credit: number;
  currency: string | null;
};

export function Cart({
  lines,
  subtotal,
  tax,
  totalDiscount,
  total,
  customer,
  taxInclusive = false,
  onClear,
  onHold,
  onAdjustQty,
  onTapLine,
  onToggleCustomer,
  onPay,
  currency,
}: {
  lines: CartLineEx[];
  subtotal: number;
  tax: number;
  totalDiscount: number;
  total: number;
  customer: CartCustomer | null;
  taxInclusive?: boolean;
  onClear: () => void;
  onHold: () => void;
  onAdjustQty: (id: string, delta: number) => void;
  onTapLine: (line: CartLineEx) => void;
  onToggleCustomer: () => void;
  onPay: () => void;
  currency: string;
}) {
  const t = useTranslations("pos");

  return (
    <aside className="pos-cart">
      <header className="pos-cart-head">
        <h2 className="serif">{t("cart.title")}</h2>
        <div style={{ flex: 1 }} />
        {lines.length > 0 && (
          <>
            <button type="button" className="pos-link" onClick={onHold}>
              <Pause size={12} strokeWidth={1.5} />
              {t("cart.hold")}
            </button>
            <button type="button" className="pos-link" onClick={onClear}>
              {t("cart.clear")}
            </button>
          </>
        )}
      </header>

      <button type="button" className="pos-customer" onClick={onToggleCustomer}>
        {customer ? (
          <>
            <div className="pos-customer-avatar serif">{customer.name.slice(0, 1)}</div>
            <div style={{ flex: 1, textAlign: "start" }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{customer.name}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {t("cart.visits", { count: customer.visits })} · {customer.credit} {currency} {t("cart.storeCredit")}
              </div>
            </div>
            <X size={14} strokeWidth={1.5} />
          </>
        ) : (
          <>
            <div className="pos-customer-avatar pos-customer-avatar-empty">
              <User size={14} strokeWidth={1.5} />
            </div>
            <div style={{ flex: 1, textAlign: "start", fontSize: 13, color: "var(--ink-3)" }}>
              {t("cart.addCustomer")}
            </div>
            <Plus size={14} strokeWidth={1.5} style={{ color: "var(--ink-3)" }} />
          </>
        )}
      </button>

      <div className="pos-cart-lines">
        {lines.length === 0 ? (
          <div className="pos-empty">
            <EmptyBasket />
            <p className="serif">{t("cart.empty.title")}</p>
            <span>
              {t.rich("cart.empty.body", {
                esc: (chunks) => <kbd>{chunks}</kbd>,
              })}
            </span>
          </div>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className="pos-line"
              role="button"
              tabIndex={0}
              onClick={() => onTapLine(line)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTapLine(line);
                }
              }}
            >
              <div className="pos-line-qty" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onAdjustQty(line.id, -1)}
                  aria-label="Decrease quantity"
                >
                  <Minus size={14} strokeWidth={1.5} />
                </button>
                <span className="tnum">{line.qty}</span>
                <button
                  type="button"
                  onClick={() => onAdjustQty(line.id, +1)}
                  aria-label="Increase quantity"
                >
                  <Plus size={14} strokeWidth={1.5} />
                </button>
              </div>
              <div className="pos-line-body">
                <div className="pos-line-name">{line.p.name}</div>
                <div className="pos-line-sub">
                  {line.p.price} {currency} {t("line.each")}
                  {line.discount > 0 && (
                    <span style={{ color: "var(--accent)" }}> · − {line.discount}%</span>
                  )}
                  {line.note && <span style={{ fontStyle: "italic" }}> · {line.note}</span>}
                </div>
              </div>
              <div className="pos-line-total tnum">{Math.round(line.price)}</div>
            </div>
          ))
        )}
      </div>

      <div className="pos-totals">
        <div className="pos-totals-row">
          <span>{t("cart.subtotal")}</span>
          <span className="tnum">{Math.round(subtotal)}</span>
        </div>
        {totalDiscount > 0 && (
          <div className="pos-totals-row pos-totals-discount">
            <span>{t("cart.discount")}</span>
            <span className="tnum">− {Math.round(totalDiscount)}</span>
          </div>
        )}
        {tax > 0 && (
          <div className="pos-totals-row">
            <span>{taxInclusive ? t("cart.taxIncluded") : t("cart.tax")}</span>
            <span className="tnum">{Math.round(tax)}</span>
          </div>
        )}
      </div>

      <div className="pos-hero-total">
        <span className="pos-hero-kicker">{t("cart.totalKicker", { currency })}</span>
        <div className="pos-hero-amount serif tnum">
          <span className="cur">{currency === "EGP" ? "£" : currency}</span>
          {Math.round(total)}
        </div>
      </div>

      <button
        type="button"
        className="pos-pay"
        disabled={lines.length === 0}
        onClick={onPay}
        aria-label={`${t("cart.pay")} ${total}`}
      >
        <span className="pos-pay-label">{t("cart.pay")}</span>
        <span className="pos-pay-amount tnum">{Math.round(total)}</span>
      </button>
    </aside>
  );
}
