---
name: changelog
description: Generate a Keep a Changelog entry from recent git commits. Usage: /changelog [--from <ref>] [--to <ref>]
---

# /changelog

Generate a structured changelog from git history. Args: `$ARGUMENTS`

## Steps

### 1. Get commits

```bash
git log --oneline --no-merges <from>..<to>
```

If no range given, default to `HEAD~20..HEAD` (last 20 commits).

### 2. Parse conventional commits

Group by type:
- `feat:` → **Added**
- `fix:` → **Fixed**
- `chore:` / `refactor:` → **Changed**
- `docs:` → **Documentation**
- Breaking changes (marked with `!` or `BREAKING CHANGE:`) → **Breaking**

Ignore: `Merge *`, `Co-Authored-By *`, automated commits.

### 3. Output Keep a Changelog format

```markdown
## [Unreleased] — YYYY-MM-DD

### Added
- Workspace settings redesign with Notion-style sidebar nav (#feat commits)

### Fixed
- Password reset PKCE flow not completing on Safari

### Changed
- Invitation cancel button now uses modal confirmation instead of browser confirm()
```

### 4. Lint check

Flag any commits that don't follow conventional commit format:
```
⚠ Non-conventional commits (should be reworded before tagging):
  abc1234 — "wip stuff" — missing type prefix
```

## Options

- `--from v1.0.0` — start from a git tag
- `--to HEAD` — end ref (default: HEAD)
- `--strict` — fail on any non-conventional commit
