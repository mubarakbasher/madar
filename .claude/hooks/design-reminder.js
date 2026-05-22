#!/usr/bin/env node
// Madar — UserPromptSubmit hook
// When the user asks to add/port/build/implement a screen or page,
// remind them to check docs/design/ for an existing prototype.
// Writes a one-line hint to stdout (which Claude Code adds to the prompt context)
// only when a trigger phrase appears. Otherwise exits silently.

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw || '{}');
    const prompt = (payload?.prompt || '').toLowerCase();
    if (!prompt) return;

    const triggers = [
      /\badd\b.*\bscreen\b/, /\bnew\b.*\bscreen\b/,
      /\badd\b.*\bpage\b/, /\bnew\b.*\bpage\b/,
      /\bbuild\b.*(screen|page|component)\b/,
      /\bimplement\b.*(screen|page|ui|component)\b/,
      /\bport\b.*(prototype|design|screen)\b/,
      /\bcreate\b.*(screen|page|component)\b/,
      /\bdesign\b.*(layout|hero|landing)\b/,
    ];

    if (!triggers.some((re) => re.test(prompt))) return;

    process.stdout.write(
      `[madar] Check docs/design/ for an existing prototype first. If one exists, use /madar-port-screen or the madar-design-porter subagent rather than rebuilding from scratch — the prototype is the source of truth for the visual.`
    );
  } catch {
    // Never block on hook errors.
  }
});
