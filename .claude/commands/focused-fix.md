---
name: focused-fix
description: Deep-dive feature repair — systematically fix an entire feature/module across all its files and dependencies. Usage: /focused-fix <feature-path>
---

# /focused-fix

Systematically repair an entire feature or module using the 5-phase protocol. Target: `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask the user which feature/module to fix.

## Protocol — Execute ALL 5 Phases IN ORDER

### Phase 1: SCOPE — Map the Feature Boundary

1. Identify the primary folder/files for the target feature
2. Read EVERY file in that folder — understand its purpose
3. Output a feature manifest:

```
FEATURE SCOPE:
  Primary path: <path>
  Entry points: [files imported by other parts of the app]
  Internal files: [files only used within this feature]
  Total files: N
```

### Phase 2: TRACE — Map All Dependencies

**INBOUND** (what this feature imports):
- For every import statement, trace to source, verify it exists and is exported
- Check env vars, config files, DB models, API endpoints, third-party packages

**OUTBOUND** (what imports this feature):
- Search entire codebase for imports from this feature
- Verify consumers use the correct API/interface

Output a dependency map: inbound, outbound, env vars, config files.

### Phase 3: DIAGNOSE — Find Every Issue

Run ALL diagnostic checks:

- **Code**: imports resolve, no circular deps, types consistent, error handling, TODO/FIXME
- **Runtime**: env vars set, migrations current, API shapes correct
- **Config**: validate config files, check dev/prod mismatches

For each issue:
- Confirm root cause with evidence before adding to fix list
- Assign risk: HIGH (public API, auth, >3 callers) / MED (internal with tests) / LOW (leaf module)

Output a diagnosis report grouped by severity.

### Phase 4: FIX — Repair Systematically

Fix in this EXACT order:
1. **Dependencies** — broken imports, missing packages
2. **Types** — type mismatches at boundaries
3. **Logic** — business logic bugs
4. **Integration** — verify end-to-end with consumers

Rules:
- Fix ONE issue at a time, run `npm run type-check` after each
- Fix HIGH before MED before LOW
- **3-Strike Rule**: If 3+ fixes create NEW issues, STOP and tell the user the architecture may need rethinking.

### Phase 5: VERIFY — Confirm Everything Works

1. Run `npm run type-check` — must pass clean
2. Run `npm run lint` — must pass clean
3. Summarize all changes made

## Iron Law

```
NO FIXES WITHOUT COMPLETING SCOPE → TRACE → DIAGNOSE FIRST
```
