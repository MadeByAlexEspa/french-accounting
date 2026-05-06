---
name: user-story
description: Generate INVEST-compliant user stories with acceptance criteria. Usage: /user-story <generate|sprint N>
---

# /user-story

Generate structured user stories for Compte-Pote. Mode: `$ARGUMENTS`

- `/user-story generate` — interactive: ask for feature, persona, epic
- `/user-story sprint 21` — plan a sprint with N story-point capacity

## Generate mode

Ask the user:
1. Feature description (what are we building?)
2. Target persona (owner / admin / member / accountant)
3. Epic name (e.g. "Gestion d'équipe", "TVA", "Comptabilité annuelle")

Output 3–5 user stories in this format:

```
Story: <title>
As a <persona>, I want <action> so that <outcome>.

Acceptance Criteria:
  ✓ Given <context>, when <action>, then <result>
  ✓ ...

Story Points: N
Priority: High / Medium / Low
```

INVEST criteria: Independent, Negotiable, Valuable, Estimable, Small, Testable.

## Sprint mode

Given a capacity (story points), select and sequence stories that fit. Output:

```
Sprint Plan — N story points

[P1] Story title (3 pts) — Critical path
[P2] Story title (5 pts)
[P3] Story title (2 pts)

Total: N pts / N capacity
Overflow (backlog):
  - Story title (8 pts) — move to next sprint
```

Prefer stories that unblock other stories (critical path first).
