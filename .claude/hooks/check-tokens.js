#!/usr/bin/env node
// Madar — PostToolUse hook
// Advisory token / hardcoded-string lint for apps/web/**/*.tsx and apps/admin/**/*.tsx.
// Reads the hook JSON payload from stdin, inspects the just-edited file,
// and prints findings to stderr. Always exits 0 — never blocks the edit.

const fs = require('node:fs');
const path = require('node:path');

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw || '{}');
    const filePath = payload?.tool_input?.file_path;
    if (!filePath) return;

    const norm = filePath.replace(/\\/g, '/');
    const inTenant = /\/apps\/web\//.test(norm);
    const inAdmin = /\/apps\/admin\//.test(norm);
    if (!inTenant && !inAdmin) return;
    if (!/\.(tsx|ts|css|scss)$/.test(norm)) return;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }

    const findings = [];
    const lines = content.split(/\r?\n/);

    const ALLOWED_HEX = new Set([
      '#000', '#fff', '#000000', '#ffffff', '#FFF', '#000000', '#FFFFFF',
    ]);

    lines.forEach((line, i) => {
      const lineNo = i + 1;
      const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

      // Hardcoded hex colors — anywhere outside an allowed allowlist
      const hexMatches = stripped.match(/#[0-9A-Fa-f]{3,8}\b/g);
      if (hexMatches) {
        for (const hex of hexMatches) {
          if (ALLOWED_HEX.has(hex)) continue;
          findings.push(`  ${lineNo}: hardcoded color "${hex}" — use a token (var(--accent), var(--ink), …)`);
        }
      }

      // Hardcoded px sizes in inline style or className strings
      // Skip lines that look like CSS files with the variable definition
      if (!/^\s*--/.test(stripped)) {
        const pxMatches = stripped.match(/\b\d{1,3}px\b/g);
        if (pxMatches) {
          for (const px of pxMatches) {
            // Allow 0px and 1px (borders, hairlines)
            if (/^[01]px$/.test(px)) continue;
            findings.push(`  ${lineNo}: hardcoded "${px}" — use a spacing token (var(--space-N))`);
          }
        }
      }

      // Tailwind physical-axis classes
      const physicalMatches = stripped.match(/\b(ml-|mr-|pl-|pr-|left-\d|right-\d|text-left|text-right|border-l\b|border-r\b)/g);
      if (physicalMatches) {
        for (const m of physicalMatches) {
          findings.push(`  ${lineNo}: physical CSS "${m}" — use logical (ms-, me-, ps-, pe-, text-start, text-end, border-s, border-e) for RTL safety`);
        }
      }
    });

    // Hardcoded English in JSX text — only flag for tenant app, only if useTranslations isn't imported
    if (inTenant && /\.tsx$/.test(norm)) {
      const importsUseTranslations = /from\s+['"]next-intl['"]/.test(content);
      if (!importsUseTranslations) {
        const jsxText = content.match(/>\s*[A-Z][a-z]{2,}[^<>{}\n]{2,}</g);
        if (jsxText && jsxText.length > 0) {
          findings.push(`  · ${jsxText.length} JSX text node(s) look like English copy; no \`useTranslations\` import — wire i18n before commit`);
        }
      }
    }

    if (findings.length > 0) {
      process.stderr.write(
        `\n[madar token-check] ${path.relative(process.cwd(), filePath).replace(/\\/g, '/')}\n` +
        findings.join('\n') +
        `\n  · advisory only; run /madar-port-screen or /madar-i18n-sync for guidance\n\n`
      );
    }
  } catch {
    // Never block on hook errors.
  }
});
