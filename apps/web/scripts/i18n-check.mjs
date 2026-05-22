#!/usr/bin/env node
// i18n parity check — fails CI on EN/AR drift in apps/web/messages/.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const en = JSON.parse(readFileSync(resolve(here, "../messages/en.json"), "utf8"));
const ar = JSON.parse(readFileSync(resolve(here, "../messages/ar.json"), "utf8"));

const flat = (obj, prefix = "") =>
  Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(acc, flat(v, key));
    else acc[key] = v;
    return acc;
  }, {});

const E = flat(en);
const A = flat(ar);
const enKeys = new Set(Object.keys(E));
const arKeys = new Set(Object.keys(A));

const missingInAr = [...enKeys].filter((k) => !arKeys.has(k));
const missingInEn = [...arKeys].filter((k) => !enKeys.has(k));
const todos = Object.entries(A).filter(([, v]) => typeof v === "string" && v.includes("__TODO_AR__"));

let fail = 0;
if (missingInAr.length) {
  console.error(`\n[i18n] Missing in ar.json (${missingInAr.length}):`);
  missingInAr.forEach((k) => console.error(`  · ${k}`));
  fail = 1;
}
if (missingInEn.length) {
  console.error(`\n[i18n] Missing in en.json (${missingInEn.length}):`);
  missingInEn.forEach((k) => console.error(`  · ${k}`));
  fail = 1;
}
if (todos.length) {
  console.error(`\n[i18n] ${todos.length} AR value(s) still marked __TODO_AR__ — translate before merge.`);
  todos.forEach(([k, v]) => console.error(`  · ${k}: ${v}`));
}

if (!fail && !todos.length) {
  console.log(`i18n check passed · ${enKeys.size} keys in EN/AR lockstep.`);
}
process.exit(fail);
