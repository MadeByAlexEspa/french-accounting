---
name: a11y-audit
description: Scan the app for WCAG 2.2 accessibility violations and fix them. Usage: /a11y-audit [path]
---

# /a11y-audit

Scan the Compte-Pote frontend for WCAG 2.2 accessibility issues and fix them. Target path: `$ARGUMENTS` (defaults to `app/` if empty).

## Phase 1: Scan

Read all `.tsx` files in the target path. For each file check:

**Critical (must fix)**
- Images without `alt` attribute
- Form `<input>` without associated `<label>` (missing `htmlFor`/`id` pair or `aria-label`)
- Buttons with no accessible text (icon-only buttons missing `aria-label`)
- Interactive elements not reachable by keyboard (`tabIndex={-1}` on focusable elements)
- Missing `role` on custom interactive components

**Serious**
- Color as the only visual indicator (e.g. error state shown only via color)
- `<div onClick>` instead of `<button>` — not keyboard accessible
- Missing focus styles (`:focus-visible` not defined while `outline: none` is set)
- Heading hierarchy skipped (h1 → h3 without h2)

**Moderate**
- Missing `aria-current` on active nav items
- Missing `role="alert"` or `aria-live` on dynamic error/success messages
- Tooltip/title attributes on interactive elements (use `aria-describedby` instead)

**Minor**
- Redundant `alt` text that repeats surrounding text
- Missing `lang` on `<html>` element

Also check `app/globals.css` for:
- `outline: none` / `outline: 0` without a `:focus-visible` replacement → color contrast failures

## Phase 2: Report

Output grouped by severity:
```
A11y Audit: <path>
  Critical: N | Serious: N | Moderate: N | Minor: N
  Files with issues: N

[CRITICAL] app/(auth)/login/page.tsx:34
  <input id="email"> has no <label> or aria-label
  Fix: Add <label htmlFor="email">Email</label>
```

## Phase 3: Fix

**Auto-fix without asking:**
- Add `aria-hidden="true"` to decorative icons (`<svg>`, lucide icons used as decoration)
- Add `type="button"` to non-submit `<button>` elements
- Add `aria-label` to icon-only buttons where the label is obvious from context
- Add `role="alert"` to error message divs with class `dash-error` or `auth-error`
- Add `aria-current="page"` to active nav links

**Ask before fixing:**
- Missing `alt` text (need descriptive text)
- Heading restructuring (may affect visual layout)
- Color contrast failures in CSS (need color replacement)

## Phase 4: Verify

Run `npm run type-check` — must pass after all fixes.

Output a summary: issues found, issues fixed, issues requiring manual attention.
