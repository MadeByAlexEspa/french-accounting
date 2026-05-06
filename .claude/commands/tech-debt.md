---
name: tech-debt
description: Scan, prioritize, and report technical debt in the codebase. Usage: /tech-debt [scan|prioritize|report]
---

# /tech-debt

Scan Compte-Pote for technical debt and produce a prioritized remediation plan.

Mode: `$ARGUMENTS` — one of `scan`, `prioritize`, `report`. Defaults to `report` (full scan + prioritized output).

## Debt Categories to Scan

### Code quality
- `TODO`, `FIXME`, `HACK`, `XXX` comments
- Functions longer than 80 lines
- Files with >300 lines
- Deeply nested conditionals (>3 levels)
- Duplicated logic across files (same pattern copy-pasted)

### TypeScript
- `any` type usage (non-`lib/types/` files)
- Missing return type on exported functions
- `// @ts-ignore` and `// @ts-expect-error` suppressions

### Architecture
- `'use client'` on pages that don't need browser APIs (could be Server Components)
- Direct Supabase queries in page components (should be in `actions.ts` or server components)
- Hardcoded strings that should be constants or env vars
- Missing error boundaries on client components that fetch data

### Dependencies
- Packages in `dependencies` that should be in `devDependencies`
- `npm audit` security vulnerabilities

### CSS
- Inline `style={{}}` props in dashboard pages (should be CSS classes in `globals.css`)
- Magic numbers in styles

### Database
- Missing `IF NOT EXISTS` on migrations (risky on re-run)
- Tables without RLS enabled
- Missing indexes on `workspace_id` columns used in WHERE clauses

## Output Format

```
TECH DEBT REPORT — Compte-Pote
Scanned: <N> files

CRITICAL (blocks reliability/security)
  [SEC] supabase/migrations/xxx.sql — RLS not enabled on table `yyy`
  ...

HIGH (meaningful maintenance cost)
  [ARCH] app/(dashboard)/tva/page.tsx:45 — Direct supabase query in component, should be server action
  ...

MEDIUM (code smell, will slow future work)
  [TS] lib/email.ts:12 — implicit `any` on fetch response
  ...

LOW (cosmetic, fix when nearby)
  [CSS] app/(dashboard)/transactions/page.tsx:88 — inline style `marginBottom: 16` (use .dash-* class)
  ...

SUMMARY
  Critical: N | High: N | Medium: N | Low: N
  Estimated remediation: ~Xh
```

## Prioritize mode

Rank debt items by: (Impact × Frequency of touching this file) / Effort to fix.
Flag "quick wins" (Low effort, Medium+ impact) separately.

## Report mode

Full scan + prioritized list + recommended sprint allocation (what to fix this sprint vs backlog).
