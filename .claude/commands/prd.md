---
name: prd
description: Generate a product requirements document for a feature. Usage: /prd <feature-or-problem>
---

# /prd

Generate a concise PRD for Compte-Pote. Feature or problem: `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask the user what feature or problem to document.

## Output Structure

### Problem Statement
One paragraph: what pain does the user have, who has it, how often, what's the cost of not solving it.

### Goals
3–5 bullet points: what success looks like, measurable where possible.

### Non-goals
Explicit scope boundaries — what this feature will NOT do.

### User Stories
Format: `As a [role], I want [action] so that [outcome].`
Include acceptance criteria for each story.

### Technical Approach
High-level: which files/tables/APIs will be involved. Flag any schema migrations needed.

### Metrics & Success Thresholds
How will we know it worked? (e.g. "invite acceptance rate > 60% within 48h")

### Open Questions
Unresolved decisions that need product or user input before implementation.

---

Keep the total PRD under 1 page. Flag any assumption that needs validation before building.
