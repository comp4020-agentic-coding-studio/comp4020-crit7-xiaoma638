import { sql } from "drizzle-orm";
import { index, int, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

// Degree rules: rewritten from src/data/ on every boot (see src/lib/sync.ts).
export const degrees = sqliteTable("degrees", {
  code: text().primaryKey(),
  name: text().notNull(),
  year: int().notNull(),
  totalUnits: int("total_units").notNull(),
  durationYears: int("duration_years").notNull(),
  sourceUrl: text("source_url").notNull(),
  notes: text().notNull().default(""),
});

export const courses = sqliteTable("courses", {
  code: text().primaryKey(),
  title: text().notNull(),
  units: int().notNull(),
});

export const requirements = sqliteTable(
  "requirements",
  {
    id: text().primaryKey(),
    degreeCode: text("degree_code")
      .notNull()
      .references(() => degrees.code),
    parentId: text("parent_id"),
    position: int().notNull(),
    kind: text({ enum: ["group", "courses", "pool", "choice", "constraint", "electives", "total", "manual"] }).notNull(),
    label: text().notNull(),
    note: text(),
    minUnits: int("min_units"),
    maxUnits: int("max_units"),
    subjects: text(),
    levelMin: int("level_min"),
    levelMax: int("level_max"),
    scope: text({ enum: ["plan", "parent"] }),
  },
  (t) => [index("requirements_degree").on(t.degreeCode)],
);

export const requirementCourses = sqliteTable(
  "requirement_courses",
  {
    requirementId: text("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    courseCode: text("course_code").notNull(),
    times: int().notNull().default(1),
    position: int().notNull(),
  },
  (t) => [primaryKey({ columns: [t.requirementId, t.courseCode] })],
);

export const requirementExclusions = sqliteTable(
  "requirement_exclusions",
  {
    requirementId: text("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    courseCode: text("course_code").notNull(),
  },
  (t) => [primaryKey({ columns: [t.requirementId, t.courseCode] })],
);

// Student state: survives every deploy on the volume.
export const plans = sqliteTable("plans", {
  id: text().primaryKey(),
  degreeCode: text("degree_code")
    .notNull()
    .references(() => degrees.code),
  startYear: int("start_year").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// No foreign key to courses: a student can plan any ANU course, not just the
// ones some rule names.
export const planCourses = sqliteTable(
  "plan_courses",
  {
    id: int().primaryKey({ autoIncrement: true }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    courseCode: text("course_code").notNull(),
    term: text().notNull(),
    units: int().notNull(),
  },
  (t) => [unique("plan_course_term").on(t.planId, t.courseCode, t.term)],
);

// Requirement ids are stable paths from the seed files, so a choice outlives a
// re-seed; one that no longer matches an option is simply ignored.
export const planChoices = sqliteTable(
  "plan_choices",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    choiceId: text("choice_id").notNull(),
    optionId: text("option_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.choiceId] })],
);

export type Plan = typeof plans.$inferSelect;
export type PlanCourse = typeof planCourses.$inferSelect;
