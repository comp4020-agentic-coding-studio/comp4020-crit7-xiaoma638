# Harness: ANU computing degree planner (crit 7)

Rules I hold the agent to, each from something that went wrong or right this week.

## Scope
- This is a crit 7 prototype, not a production system. Don't add degrees, offering data, prerequisites, accounts or historical rules unless I ask.
- Improve the core flow first: find a course, add it to a semester, understand what it counts toward, know what to do next.

## Degree rules are data, grounded in P&C
- Rules live in `src/data/` and come only from the 2027 ANU Programs and Courses pages. Every file cites its page in `sourceUrl`.
- Never invent a course code, unit value or rule. If a page is missing or contradicts itself, use the formal requirements block and record the gap in `notes`.
- Adding a degree means adding data, not page logic.

## Rule engine
- A course counts once, unless a rule lists it to be taken twice (COMP4550 ×2). Extra sittings count toward nothing, including the total.
- An upper limit is never "met": it is within or over. Only completion requirements count toward "n of m met".
- What the planner can't check (offerings, prerequisites, timetable clashes, the TPS tag) is labelled as not checked, never shown as green.
- Any change to the engine starts with a failing test in `src/lib/*.test.ts`.

## What the student sees
- Passing tests are not enough: ask what a student would conclude from the screen.
- Listed courses are added only from an explicit search result, using their published units. Free text is never turned into a course.
- Every add, move and removal gets feedback with undo.

## Workflow
- Schema changes: edit `src/lib/schema.ts`, run `pnpm db:generate`, commit the migration.
- New pages go in `spec/routes.ts`. Contracts are tested over HTTP in `spec/planner.test.ts`.
- Before calling a change done: `pnpm check`, then use it in a browser at 1400px and 390px.
- Deploy with `mise exec -- flyctl deploy --remote-only --ha=false -a comp4020-crit7-xiaoma638` and check the live URL.
- Commit in small stages with messages that say why. Don't push or make the repo public without asking. Never commit `mise.local.toml`.
- Reply to me in Chinese; keep code, paths and commit messages in English.
