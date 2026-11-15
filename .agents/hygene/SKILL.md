---
name: hygene
description: Clean up code after a change, so it reads like the code around it. Use after finishing a task and before committing, or when asked to tidy, simplify, or hygene. Covers dead code, leftover legacy paths, needless abstractions, and long comment blocks.
---

# Hygene

Review the code the task touched (`git diff`, plus files it changed), then fix what you find. Don't hunt for bugs; this pass is about quality.

- Prefer simplifying existing code over introducing new abstractions.
- Remove dead code, unused imports, obsolete utilities, and orphaned references.
- Never leave legacy implementations alongside their replacements unless explicitly required.
- Avoid compatibility shims, redundant wrappers, speculative abstractions, and unnecessary fallbacks.
- Fix problems at their source rather than layering workarounds on top.
- Reuse existing patterns and utilities before creating new ones.
- Keep changes focused. Don't refactor unrelated code without a clear reason.
- Preserve existing behavior during refactoring and verify with appropriate tests.
- Look for duplication, unnecessary complexity, and leftover artifacts.

## Comments

Comments should be rare and concise. Long comment blocks lead agents into future antipatterns or keep them stuck in legacy practices.

- One line is the default. A doc comment says what something is or returns, not how it works or why it changed.
- Cut comments that restate the code, narrate the change ("now", "instead of", "no longer"), or record history.
- Keep a comment only for something the code can't say: a non-obvious reason, a unit, a gotcha.
- If comments have any unique formating, they should follow an established pattern instead of a mix of commenting styles

When done, run `vp check` and `vp test`.
