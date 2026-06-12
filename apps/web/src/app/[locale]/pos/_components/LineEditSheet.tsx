"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X, Check } from "lucide-react";
import type { CartLineEx } from "./Cart";

export function LineEditSheet({
  line,
  onClose,
  onUpdate,
  onRemove,
}: {
  line: CartLineEx;
  onClose: () => void;
  onUpdate: (patch: { qty: number; discount: number; note: string }) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("pos.line");
  const tCommon = useTranslations("common");
  const [qty, setQty] = useState(line.qty);
  const [discount, setDiscount] = useState(line.discount || 0);
  const [note, setNote] = useState(line.note || "");
  const newPrice = line.p.price * qty * (1 - discount / 100);

  return (
    <div className="pos-modal-bg" onClick={onClose}>
      <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pos-modal-head">
          <div>
            <span className="kicker">{t("editTitle")}</span>
            <h3 className="serif">{line.p.name}</h3>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {line.p.price} {t("each")} · {t("sku")}{" "}
              <span style={{ fontFamily: "var(--mono)" }}>{line.p.sku}</span>
            </div>
          </div>
          <button type="button" className="pos-icon-btn" onClick={onClose} aria-label={tCommon("close")}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </header>

        <div style={{ padding: "20px var(--space-5)" }}>
          <div className="kicker" style={{ marginBottom: "var(--space-2)" }}>
            {t("quantity")}
          </div>
          <div className="pos-numpad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, "−", 0, "⌫"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  if (k === "−") setQty((q) => Math.max(1, q - 1));
                  else if (k === "⌫") setQty((q) => Math.max(1, Math.floor(q / 10) || 1));
                  else setQty((q) => (q < 10 ? q * 10 + Number(k) : Number(k)));
                }}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="pos-numpad-display">
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("quantity")}</span>
            <span className="serif tnum" style={{ fontSize: 36, fontWeight: 500 }}>
              {qty}
            </span>
          </div>

          <div className="kicker" style={{ marginTop: 18, marginBottom: "var(--space-2)" }}>
            {t("lineDiscount")}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[0, 3, 5].map((d) => (
              <button
                key={d}
                type="button"
                className="pos-chip"
                aria-pressed={discount === d}
                onClick={() => setDiscount(d)}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {d === 0 ? t("discountNone") : `${d}%`}
              </button>
            ))}
          </div>

          <div className="kicker" style={{ marginTop: 18, marginBottom: 6 }}>
            {t("noteHeader")}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
            className="pos-input"
          />
        </div>

        <footer className="pos-modal-foot">
          <button
            type="button"
            className="pos-btn"
            style={{
              color: "var(--rose)",
              borderColor: "color-mix(in oklab, var(--rose) 30%, var(--rule))",
            }}
            onClick={onRemove}
          >
            <X size={12} strokeWidth={1.5} />
            {t("remove")}
          </button>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: "end", marginInlineEnd: "var(--space-3)" }}>
            <div className="kicker">{t("newTotal")}</div>
            <div className="serif tnum" style={{ fontSize: 22, fontWeight: 500 }}>
              {Math.round(newPrice)}
            </div>
          </div>
          <button type="button" className="pos-btn pos-btn-primary" onClick={() => onUpdate({ qty, discount, note })}>
            <Check size={12} strokeWidth={1.5} />
            {t("update")}
          </button>
        </footer>
      </div>
    </div>
  );
}
