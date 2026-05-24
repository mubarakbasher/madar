#!/usr/bin/env node
// i18n check for apps/admin — validates en.json is well-formed with no empty values.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(here, "../messages/en.json"), "utf8");

let en;
try {
  en = JSON.parse(raw);
} catch (e) {
  console.error("[admin-i18n] en.json is not valid JSON:", e.message);
  process.exit(1);
}

const flat = (obj, prefix = "") =>
  Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(acc, flat(v, key));
    else acc[key] = v;
    return acc;
  }, {});

const entries = flat(en);
const keys = Object.keys(entries);
const empty = keys.filter((k) => typeof entries[k] === "string" && entries[k].trim() === "");

let fail = 0;
if (empty.length) {
  console.error(`\n[admin-i18n] ${empty.length} key(s) have empty string values:`);
  empty.forEach((k) => console.error(`  · ${k}`));
  fail = 1;
}

if (!fail) {
  console.log(`admin i18n check passed · ${keys.length} keys in en.json.`);
}
process.exit(fail);
