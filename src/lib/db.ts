import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { CourseRef, RuleNode } from "./rules";
import {
  courses,
  degrees,
  type Plan,
  type PlanCourse,
  planChoices,
  planCourses,
  plans,
  requirementCourses,
  requirementExclusions,
  requirements,
} from "./schema";
import { loadCatalogue } from "./seed";
import { syncCatalogue } from "./sync";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });
syncCatalogue(db, loadCatalogue());

export type { Plan, PlanCourse };
export type Degree = typeof degrees.$inferSelect;

export function listDegrees(): Degree[] {
  return db.select().from(degrees).orderBy(asc(degrees.name)).all();
}

export function getDegree(code: string): Degree | undefined {
  return db.select().from(degrees).where(eq(degrees.code, code)).get();
}

export function courseInfo(codes: string[]): Map<string, { title: string; units: number }> {
  if (!codes.length) return new Map();
  const rows = db.select().from(courses).where(inArray(courses.code, codes)).all();
  return new Map(rows.map((r) => [r.code, { title: r.title, units: r.units }]));
}

export function loadTree(degreeCode: string): RuleNode[] {
  const rows = db
    .select()
    .from(requirements)
    .where(eq(requirements.degreeCode, degreeCode))
    .orderBy(asc(requirements.position))
    .all();
  const ids = rows.map((r) => r.id);
  const listed = new Map<string, CourseRef[]>();
  const excluded = new Map<string, string[]>();
  if (ids.length) {
    for (const c of db
      .select()
      .from(requirementCourses)
      .where(inArray(requirementCourses.requirementId, ids))
      .orderBy(asc(requirementCourses.position))
      .all()) {
      listed.set(c.requirementId, [...(listed.get(c.requirementId) ?? []), { code: c.courseCode, times: c.times }]);
    }
    for (const e of db.select().from(requirementExclusions).where(inArray(requirementExclusions.requirementId, ids)).all()) {
      excluded.set(e.requirementId, [...(excluded.get(e.requirementId) ?? []), e.courseCode]);
    }
  }

  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);

  const build = (r: (typeof rows)[number]): RuleNode => {
    const base = { id: r.id, label: r.label, note: r.note ?? undefined };
    const opt = (v: number | null) => v ?? undefined;
    const children = (byParent.get(r.id) ?? []).map(build);
    const filter = {
      subjects: r.subjects ? r.subjects.split(",") : undefined,
      levelMin: opt(r.levelMin),
      levelMax: opt(r.levelMax),
      exclude: excluded.get(r.id),
    };
    switch (r.kind) {
      case "group":
        return { ...base, kind: "group", minUnits: opt(r.minUnits), children };
      case "choice":
        return { ...base, kind: "choice", options: children };
      case "courses":
        return { ...base, kind: "courses", courses: listed.get(r.id) ?? [], minUnits: opt(r.minUnits), maxUnits: opt(r.maxUnits) };
      case "pool":
        return { ...base, ...filter, kind: "pool", minUnits: r.minUnits ?? 0, maxUnits: opt(r.maxUnits) };
      case "constraint":
        return { ...base, ...filter, kind: "constraint", scope: r.scope ?? "plan", minUnits: opt(r.minUnits), maxUnits: opt(r.maxUnits) };
      case "electives":
        return { ...base, kind: "electives", minUnits: r.minUnits ?? 0, levelMin: opt(r.levelMin) };
      case "total":
        return { ...base, kind: "total", minUnits: r.minUnits ?? 0 };
      case "manual":
        return { ...base, kind: "manual" };
    }
  };
  return (byParent.get(null) ?? []).map(build);
}

export const SESSIONS = ["Summer", "S1", "Winter", "S2"] as const;

// Every term a plan can use: the degree's normal span plus one spare year.
export function termsFor(plan: Plan, degree: Degree): string[] {
  const terms: string[] = [];
  for (let y = plan.startYear; y <= plan.startYear + degree.durationYears; y++) {
    for (const s of SESSIONS) terms.push(`${y} ${s}`);
  }
  return terms;
}

export function getPlan(id: string | undefined): Plan | undefined {
  if (!id) return undefined;
  return db.select().from(plans).where(eq(plans.id, id)).get();
}

// Switching degree keeps the courses (they're still the student's) but drops
// choices, which belong to the old degree's rules.
export function savePlan(id: string | undefined, degreeCode: string, startYear: number): string {
  const existing = getPlan(id);
  if (existing) {
    db.transaction((tx) => {
      tx.update(plans).set({ degreeCode, startYear }).where(eq(plans.id, existing.id)).run();
      if (existing.degreeCode !== degreeCode) tx.delete(planChoices).where(eq(planChoices.planId, existing.id)).run();
    });
    return existing.id;
  }
  const newId = randomUUID();
  db.insert(plans).values({ id: newId, degreeCode, startYear }).run();
  return newId;
}

export function listPlanCourses(planId: string): PlanCourse[] {
  return db.select().from(planCourses).where(eq(planCourses.planId, planId)).orderBy(asc(planCourses.id)).all();
}

export function addPlanCourse(planId: string, courseCode: string, term: string, units: number) {
  db.insert(planCourses).values({ planId, courseCode, term, units }).onConflictDoNothing().run();
}

export function removePlanCourse(planId: string, id: number) {
  db.delete(planCourses).where(and(eq(planCourses.planId, planId), eq(planCourses.id, id))).run();
}

export function getChoices(planId: string): Record<string, string> {
  const rows = db.select().from(planChoices).where(eq(planChoices.planId, planId)).all();
  return Object.fromEntries(rows.map((r) => [r.choiceId, r.optionId]));
}

// Only accepts an option that really is a child of that choice in the plan's degree.
export function setChoice(plan: Plan, choiceId: string, optionId: string): boolean {
  if (!optionId) {
    db.delete(planChoices).where(and(eq(planChoices.planId, plan.id), eq(planChoices.choiceId, choiceId))).run();
    return true;
  }
  const option = db
    .select({ parentId: requirements.parentId, kind: requirements.kind })
    .from(requirements)
    .where(and(eq(requirements.id, optionId), eq(requirements.degreeCode, plan.degreeCode)))
    .get();
  const choice = db
    .select({ kind: requirements.kind })
    .from(requirements)
    .where(and(eq(requirements.id, choiceId), eq(requirements.degreeCode, plan.degreeCode)))
    .get();
  if (!option || option.parentId !== choiceId || choice?.kind !== "choice") return false;
  db.insert(planChoices)
    .values({ planId: plan.id, choiceId, optionId })
    .onConflictDoUpdate({ target: [planChoices.planId, planChoices.choiceId], set: { optionId } })
    .run();
  return true;
}
