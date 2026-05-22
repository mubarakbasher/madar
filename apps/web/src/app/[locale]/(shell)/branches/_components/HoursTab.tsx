"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  branchUpdateRequest,
  type ApiBranchDetail,
  type OperatingHours,
  type WeekDay,
  type Holiday,
} from "@/lib/api/branches";

const WEEK_DAYS: WeekDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DEFAULT_HOURS: OperatingHours = {
  mon: { open: "09:00", close: "21:00", closed: false },
  tue: { open: "09:00", close: "21:00", closed: false },
  wed: { open: "09:00", close: "21:00", closed: false },
  thu: { open: "09:00", close: "21:00", closed: false },
  fri: { open: "09:00", close: "21:00", closed: false },
  sat: { open: "09:00", close: "21:00", closed: false },
  sun: { open: "09:00", close: "21:00", closed: true },
};

export function HoursTab({ branch }: { branch: ApiBranchDetail }) {
  const t = useTranslations("branches.detail.hours");
  const tHol = useTranslations("branches.detail.holidays");
  const qc = useQueryClient();

  const [hours, setHours] = useState<OperatingHours>(branch.operating_hours ?? DEFAULT_HOURS);
  const [holidays, setHolidays] = useState<Holiday[]>(branch.holidays ?? []);
  const [hoursMsg, setHoursMsg] = useState<{ kind: "saved" | "error"; text: string } | null>(null);
  const [holidayMsg, setHolidayMsg] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  const hoursMut = useMutation({
    mutationFn: () => branchUpdateRequest(branch.id, { operating_hours: hours }),
    onSuccess: () => {
      setHoursMsg({ kind: "saved", text: t("saved") });
      void qc.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: () => {
      setHoursMsg({ kind: "error", text: t("validationError") });
    },
  });

  const holidayMut = useMutation({
    mutationFn: () => branchUpdateRequest(branch.id, { holidays }),
    onSuccess: () => {
      setHolidayMsg({ kind: "saved", text: tHol("saved") });
      void qc.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: () => {
      setHolidayMsg({ kind: "error", text: tHol("validationError") });
    },
  });

  function updateDay(day: WeekDay, patch: Partial<OperatingHours[WeekDay]>): void {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
    setHoursMsg(null);
  }

  function addHoliday(): void {
    setHolidays((prev) => [
      ...prev,
      { date: new Date().toISOString().slice(0, 10), label_i18n: { en: "", ar: "" } },
    ]);
    setHolidayMsg(null);
  }

  function updateHoliday(idx: number, patch: Partial<Holiday>): void {
    setHolidays((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
    setHolidayMsg(null);
  }

  function updateHolidayLabel(idx: number, lang: "en" | "ar", value: string): void {
    setHolidays((prev) =>
      prev.map((h, i) => (i === idx ? { ...h, label_i18n: { ...h.label_i18n, [lang]: value } } : h)),
    );
    setHolidayMsg(null);
  }

  function removeHoliday(idx: number): void {
    setHolidays((prev) => prev.filter((_, i) => i !== idx));
    setHolidayMsg(null);
  }

  function canSaveHours(): boolean {
    return WEEK_DAYS.every((d) => hours[d].closed || hours[d].open < hours[d].close);
  }

  function canSaveHolidays(): boolean {
    return holidays.every(
      (h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.label_i18n.en.trim() && h.label_i18n.ar.trim(),
    );
  }

  return (
    <>
      <section className="br-section">
        <h3 className="br-section-title">{t("title")}</h3>
        <p className="br-section-sub">{t("subtitle")}</p>

        <div className="br-hours-grid">
          {WEEK_DAYS.map((d) => (
            <div key={d} className="br-hours-row">
              <div className="br-hours-day">{t(`days.${d}`)}</div>
              <label className="br-hours-toggle">
                <input
                  type="checkbox"
                  checked={!hours[d].closed}
                  onChange={(e) => updateDay(d, { closed: !e.target.checked })}
                />
                <span>{hours[d].closed ? t("closed") : t("open")}</span>
              </label>
              <input
                type="time"
                className="br-hours-input"
                value={hours[d].open}
                onChange={(e) => updateDay(d, { open: e.target.value })}
                disabled={hours[d].closed}
              />
              <input
                type="time"
                className="br-hours-input"
                value={hours[d].close}
                onChange={(e) => updateDay(d, { close: e.target.value })}
                disabled={hours[d].closed}
              />
            </div>
          ))}
        </div>

        <div className="br-actions-row">
          <button
            type="button"
            className="br-btn br-btn-primary"
            disabled={hoursMut.isPending || !canSaveHours()}
            onClick={() => hoursMut.mutate()}
          >
            {hoursMut.isPending ? t("saving") : t("save")}
          </button>
          <button
            type="button"
            className="br-btn"
            onClick={() => {
              setHours(DEFAULT_HOURS);
              setHoursMsg(null);
            }}
          >
            {t("useDefaults")}
          </button>
        </div>
        {hoursMsg && (
          <p className={hoursMsg.kind === "saved" ? "br-field-hint" : "br-field-error"}>
            {hoursMsg.text}
          </p>
        )}
      </section>

      <section className="br-section">
        <h3 className="br-section-title">{tHol("title")}</h3>
        <p className="br-section-sub">{tHol("subtitle")}</p>

        {holidays.length === 0 ? (
          <p className="br-empty-line">{tHol("empty")}</p>
        ) : (
          <ul className="br-holiday-list">
            {holidays.map((h, idx) => (
              <li key={idx} className="br-holiday-row">
                <input
                  type="date"
                  className="br-hours-input"
                  value={h.date}
                  onChange={(e) => updateHoliday(idx, { date: e.target.value })}
                />
                <input
                  type="text"
                  className="br-hours-input"
                  placeholder={tHol("labelEn")}
                  value={h.label_i18n.en}
                  onChange={(e) => updateHolidayLabel(idx, "en", e.target.value)}
                />
                <input
                  type="text"
                  className="br-hours-input"
                  placeholder={tHol("labelAr")}
                  value={h.label_i18n.ar}
                  onChange={(e) => updateHolidayLabel(idx, "ar", e.target.value)}
                  dir="rtl"
                />
                <button type="button" className="br-btn br-btn-ghost" onClick={() => removeHoliday(idx)}>
                  {tHol("remove")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="br-actions-row">
          <button type="button" className="br-btn" onClick={addHoliday}>
            {tHol("addButton")}
          </button>
          <button
            type="button"
            className="br-btn br-btn-primary"
            disabled={holidayMut.isPending || !canSaveHolidays()}
            onClick={() => holidayMut.mutate()}
          >
            {holidayMut.isPending ? tHol("saving") : tHol("save")}
          </button>
        </div>
        {holidayMsg && (
          <p className={holidayMsg.kind === "saved" ? "br-field-hint" : "br-field-error"}>
            {holidayMsg.text}
          </p>
        )}
      </section>
    </>
  );
}
