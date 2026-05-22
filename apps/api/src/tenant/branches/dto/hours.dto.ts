import { z } from "zod";

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const DayHours = z
  .object({
    open: z.string().regex(TIME_HHMM, "open must be HH:MM"),
    close: z.string().regex(TIME_HHMM, "close must be HH:MM"),
    closed: z.boolean().default(false),
  })
  .strict();

export const OperatingHoursSchema = z
  .object({
    mon: DayHours,
    tue: DayHours,
    wed: DayHours,
    thu: DayHours,
    fri: DayHours,
    sat: DayHours,
    sun: DayHours,
  })
  .strict();

export type OperatingHours = z.infer<typeof OperatingHoursSchema>;

const I18N_LABEL = z.object({
  en: z.string().trim().min(1).max(120),
  ar: z.string().trim().min(1).max(120),
});

export const HolidaysSchema = z
  .array(
    z
      .object({
        date: z.string().regex(ISO_DATE, "date must be ISO YYYY-MM-DD"),
        label_i18n: I18N_LABEL,
      })
      .strict(),
  )
  .max(200);

export type Holidays = z.infer<typeof HolidaysSchema>;

export const DEFAULT_HOURS: OperatingHours = {
  mon: { open: "09:00", close: "21:00", closed: false },
  tue: { open: "09:00", close: "21:00", closed: false },
  wed: { open: "09:00", close: "21:00", closed: false },
  thu: { open: "09:00", close: "21:00", closed: false },
  fri: { open: "09:00", close: "21:00", closed: false },
  sat: { open: "09:00", close: "21:00", closed: false },
  sun: { open: "09:00", close: "21:00", closed: true },
};
