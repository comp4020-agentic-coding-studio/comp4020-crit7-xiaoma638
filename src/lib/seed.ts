import type { CourseRef, Filter, RuleNode } from "./rules";

// The shape of the hand-transcribed files in src/data/. Ids are local to their
// parent; expand() joins them into stable paths like "AACOM/spec/ARIN-SPEC/advanced",
// which is what plans store their choices against.
type SeedBase = { id: string; label: string; note?: string };
type SeedCourse = string | { code: string; times: number };

export type SeedNode =
  | (SeedBase & { kind: "group"; minUnits?: number; children: SeedNode[] })
  | (SeedBase & { kind: "courses"; courses: SeedCourse[]; minUnits?: number; maxUnits?: number })
  | (SeedBase & Filter & { kind: "pool"; minUnits: number; maxUnits?: number })
  | (SeedBase & { kind: "choice"; options: (SeedNode | { bundle: string })[] })
  | (SeedBase & Filter & { kind: "constraint"; scope: "plan" | "parent"; minUnits?: number; maxUnits?: number })
  | (SeedBase & { kind: "electives"; minUnits: number; levelMin?: number })
  | (SeedBase & { kind: "total"; minUnits: number })
  | (SeedBase & { kind: "manual" });

export interface CourseInfo {
  title: string;
  units: number;
}

interface SeedFile {
  code: string;
  name: string;
  sourceUrl: string;
  notes?: string[];
  courses: Record<string, CourseInfo>;
  requirements: SeedNode[];
}

export type Level = "undergraduate" | "postgraduate";

export interface DegreeFile extends SeedFile {
  level: Level;
  year: number;
  totalUnits: number;
  durationYears: number;
}

export interface BundleFile extends SeedFile {
  units: number;
}

export interface Degree {
  code: string;
  name: string;
  level: Level;
  year: number;
  totalUnits: number;
  durationYears: number;
  sourceUrl: string;
  notes: string[];
  tree: RuleNode[];
}

export interface Catalogue {
  degrees: Degree[];
  courses: Map<string, CourseInfo>;
}

export const COURSE_CODE = /^[A-Z]{4}\d{4}$/;

export function expand(degreeFiles: DegreeFile[], bundleFiles: BundleFile[]): Catalogue {
  const bundles = new Map(bundleFiles.map((b) => [b.code, b]));
  const courses = new Map<string, CourseInfo>();
  const addCourses = (file: SeedFile) => {
    for (const [code, info] of Object.entries(file.courses)) {
      if (!COURSE_CODE.test(code)) throw new Error(`${file.code}: bad course code ${code}`);
      if (!courses.has(code)) courses.set(code, info);
    }
  };
  bundleFiles.forEach(addCourses);

  const node = (n: SeedNode, parent: string): RuleNode => {
    const id = `${parent}/${n.id}`;
    switch (n.kind) {
      case "group":
        return { ...n, id, children: n.children.map((c) => node(c, id)) };
      case "courses": {
        const refs: CourseRef[] = n.courses.map((c) => (typeof c === "string" ? { code: c, times: 1 } : c));
        for (const ref of refs) if (!COURSE_CODE.test(ref.code)) throw new Error(`${id}: bad course code ${ref.code}`);
        return { ...n, id, courses: refs };
      }
      case "choice":
        return {
          ...n,
          id,
          options: n.options.map((o) => {
            if (!("bundle" in o)) return node(o, id);
            const b = bundles.get(o.bundle);
            if (!b) throw new Error(`${id}: unknown bundle ${o.bundle}`);
            const bid = `${id}/${b.code}`;
            return {
              kind: "group",
              id: bid,
              label: b.name,
              minUnits: b.units,
              note: b.notes?.join(" "),
              children: b.requirements.map((c) => node(c, bid)),
            };
          }),
        };
      default:
        return { ...n, id };
    }
  };

  const degrees = degreeFiles.map((d) => {
    addCourses(d);
    const tree = d.requirements.map((n) => node(n, d.code));
    assertUniqueIds(tree);
    return {
      code: d.code,
      name: d.name,
      level: d.level,
      year: d.year,
      totalUnits: d.totalUnits,
      durationYears: d.durationYears,
      sourceUrl: d.sourceUrl,
      notes: d.notes ?? [],
      tree,
    };
  });
  return { degrees: degrees.sort((a, b) => a.name.localeCompare(b.name)), courses };
}

function assertUniqueIds(tree: RuleNode[]) {
  const seen = new Set<string>();
  const walk = (n: RuleNode) => {
    if (seen.has(n.id)) throw new Error(`duplicate requirement id ${n.id}`);
    seen.add(n.id);
    if (n.kind === "group") n.children.forEach(walk);
    if (n.kind === "choice") n.options.forEach(walk);
  };
  tree.forEach(walk);
}

export function loadCatalogue(): Catalogue {
  const degrees = import.meta.glob<DegreeFile>("../data/degrees/*.json", { eager: true, import: "default" });
  const bundles = import.meta.glob<BundleFile>("../data/bundles/*.json", { eager: true, import: "default" });
  return expand(Object.values(degrees), Object.values(bundles));
}
