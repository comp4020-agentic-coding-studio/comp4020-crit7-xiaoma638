# ANU computing degree planner

Plan an ANU computing degree semester by semester. Pick your degree and the year
you started, add courses to semesters, and after every change the planner shows
which degree requirements you've met and what's still missing: "Compulsory
courses: 4/8", "ICT-related courses: 6/12 units — 6 missing", "1000-level
courses: 36 of at most 60 units". Your plan is saved on the server and belongs
to your browser, so it's still there when you come back.

It covers the seven ANU computing degrees, using the 2027 rules from ANU
Programs and Courses: the Bachelor of Advanced Computing (Honours), Bachelor of
Computing, Bachelor of Computing (Honours), Graduate Diploma of Computing,
Master of Computing, Master of Computing (Advanced) and Master of Machine
Learning and Computer Vision, with their majors and specialisations.

## What good looks like here

The system this replaces is Programs and Courses plus a spreadsheet: P&C states
the rules in prose, and working out whether your own plan satisfies them is left
to you, usually the night before enrolment. Good, here, means the planner does
that arithmetic correctly and honestly.

**Rules are data, transcribed from the source.** Each degree, major and
specialisation is a JSON file in `src/data/`, transcribed from its 2027 P&C page
and citing that page. On every boot the files are written into SQLite, and the
page reads the rules back from the database. Adding a degree means adding a
file, not changing code.

**One model for every degree.** Requirements form a tree of a few kinds: a
compulsory list, "N units from this list", "up to N units from this list", a
pool such as "18 units of 3000- or 4000-level COMP", a level limit, a choice
(specialisation, major or capstone) the student picks, electives and the total.
That covers everything P&C states as a checkable rule across all seven degrees.

**No double counting.** P&C never says a course may count toward two
requirements, so each planned course is counted once. Courses are assigned in
the order the rules are listed, specific lists before general pools, with
electives taking what's left. Level limits and the total are checks across the
whole plan, so they can overlap with everything else.

**Never green by accident.** What the planner can't check is labelled "Check
yourself", never marked as met: the Transdisciplinary Problem-Solving tag (P&C
doesn't publish which courses carry it), credit and exemptions,
prerequisites, which semester a course runs in, load limits, GPA-based
transfers, honours marks and double degrees. Each degree lists its own gaps
under "What this planner doesn't check". Where a P&C page contradicts itself,
the formal requirements block wins and the conflict is recorded in that
degree's file.

**Checks that hold it to this.** `pnpm check` runs:

- `src/lib/rules.test.ts`: the rule engine on small hand-made cases, covering
  no double counting, list caps, twice-taken courses, choices and level limits
- `src/lib/seed.test.ts`: every data file loads, cites its 2027 page, has a
  title and unit value for every listed course, and adds up to its degree's
  total
- `spec/planner.test.ts`: against the running server, a course added to a
  semester survives a reload and its requirement turns met; plans stay separate
  per browser; every degree on offer can be planned

Whether the transcription matches P&C is judgement, not a test: the tests only
prove the files are internally consistent. Unit totals that don't add up have
caught transcription mistakes. A wrong course code that still adds up would not
be caught.

**What I chose not to build:** logins (a cookie per browser is enough to keep
plans apart), prerequisite and offering checks (P&C holds those on each course's
page, not the program page), and editing rules in the app (the rules come from
P&C, not from users).
