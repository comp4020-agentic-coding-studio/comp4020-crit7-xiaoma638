import { inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { RuleNode } from "./rules";
import { courses, degrees, requirementCourses, requirementExclusions, requirements } from "./schema";
import type { Catalogue } from "./seed";

type Row = typeof requirements.$inferInsert;

function flatten(tree: RuleNode[], degreeCode: string) {
  const rows: Row[] = [];
  const listed: (typeof requirementCourses.$inferInsert)[] = [];
  const excluded: (typeof requirementExclusions.$inferInsert)[] = [];

  const walk = (node: RuleNode, parentId: string | null, position: number) => {
    const row: Row = { id: node.id, degreeCode, parentId, position, kind: node.kind, label: node.label, note: node.note };
    switch (node.kind) {
      case "group":
        row.minUnits = node.minUnits;
        node.children.forEach((c, i) => walk(c, node.id, i));
        break;
      case "choice":
        node.options.forEach((o, i) => walk(o, node.id, i));
        break;
      case "courses":
        row.minUnits = node.minUnits;
        row.maxUnits = node.maxUnits;
        node.courses.forEach((c, i) => listed.push({ requirementId: node.id, courseCode: c.code, times: c.times, position: i }));
        break;
      case "pool":
      case "constraint":
        row.minUnits = node.minUnits;
        row.maxUnits = node.maxUnits;
        row.subjects = node.subjects?.join(",");
        row.levelMin = node.levelMin;
        row.levelMax = node.levelMax;
        if (node.kind === "constraint") row.scope = node.scope;
        for (const code of node.exclude ?? []) excluded.push({ requirementId: node.id, courseCode: code });
        break;
      case "electives":
        row.minUnits = node.minUnits;
        row.levelMin = node.levelMin;
        break;
      case "total":
        row.minUnits = node.minUnits;
        break;
    }
    rows.push(row);
  };
  tree.forEach((n, i) => walk(n, null, i));
  return { rows, listed, excluded };
}

// The seed files are the source of truth for rules; the tables are rewritten
// from them on every boot. Plans and their choices are never touched.
export function syncCatalogue(db: BetterSQLite3Database, catalogue: Catalogue) {
  db.transaction((tx) => {
    for (const [code, info] of catalogue.courses) {
      tx.insert(courses)
        .values({ code, ...info })
        .onConflictDoUpdate({ target: courses.code, set: info })
        .run();
    }
    for (const d of catalogue.degrees) {
      const values = {
        name: d.name,
        level: d.level,
        year: d.year,
        totalUnits: d.totalUnits,
        durationYears: d.durationYears,
        sourceUrl: d.sourceUrl,
        notes: d.notes.join("\n"),
      };
      tx.insert(degrees)
        .values({ code: d.code, ...values })
        .onConflictDoUpdate({ target: degrees.code, set: values })
        .run();
    }
    const codes = catalogue.degrees.map((d) => d.code);
    if (codes.length) tx.delete(requirements).where(inArray(requirements.degreeCode, codes)).run();
    for (const d of catalogue.degrees) {
      const { rows, listed, excluded } = flatten(d.tree, d.code);
      // insert in chunks: SQLite caps bound parameters per statement
      for (let i = 0; i < rows.length; i += 50) tx.insert(requirements).values(rows.slice(i, i + 50)).run();
      for (let i = 0; i < listed.length; i += 100) tx.insert(requirementCourses).values(listed.slice(i, i + 100)).run();
      for (let i = 0; i < excluded.length; i += 100) tx.insert(requirementExclusions).values(excluded.slice(i, i + 100)).run();
    }
  });
}
