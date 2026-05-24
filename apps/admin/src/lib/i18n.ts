import en from "../../messages/en.json";

type Leaf<T, P extends string = ""> = T extends string | string[]
  ? P
  : {
      [K in keyof T & string]: Leaf<T[K], P extends "" ? K : `${P}.${K}`>;
    }[keyof T & string];

type MessageKey = Leaf<typeof en>;

function resolve(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return current;
}

export function t(
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const raw = resolve(en as unknown as Record<string, unknown>, key);
  if (typeof raw !== "string") return key;
  if (!params) return raw;
  let value = raw;
  for (const [k, v] of Object.entries(params)) {
    value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return value;
}
