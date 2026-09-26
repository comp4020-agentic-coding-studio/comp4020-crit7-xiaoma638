export interface CourseRef {
  code: string;
  times: number;
}

interface Base {
  id: string;
  label: string;
  note?: string;
}

export interface Filter {
  subjects?: string[];
  levelMin?: number;
  levelMax?: number;
  exclude?: string[];
}

export type RuleNode =
  | (Base & { kind: "group"; minUnits?: number; children: RuleNode[] })
  | (Base & { kind: "courses"; courses: CourseRef[]; minUnits?: number; maxUnits?: number })
  | (Base & Filter & { kind: "pool"; minUnits: number; maxUnits?: number })
  | (Base & { kind: "choice"; options: RuleNode[] })
  | (Base & Filter & { kind: "constraint"; scope: "plan" | "parent"; minUnits?: number; maxUnits?: number })
  | (Base & { kind: "electives"; minUnits: number; levelMin?: number })
  | (Base & { kind: "total"; minUnits: number })
  | (Base & { kind: "manual" });

export type Kind = RuleNode["kind"];

export interface PlannedCourse {
  key: string;
  code: string;
  units: number;
}

// "within" is an upper limit not yet exceeded: fine, but nothing achieved.
export type Status = "met" | "unmet" | "manual" | "choose" | "within";

const settled = (s: Status) => s === "met" || s === "manual" || s === "within";

export interface Result {
  id: string;
  label: string;
  kind: Kind;
  status: Status;
  done: number;
  required: number;
  measure: "courses" | "units" | "parts";
  bound: "min" | "max";
  counted: string[];
  missing: string[];
  note?: string;
  children: Result[];
  options?: { id: string; label: string }[];
  chosen?: string;
}

export const subjectOf = (code: string) => code.slice(0, 4);
export const levelOf = (code: string) => Number(code[4]) * 1000;

export function matches(filter: Filter, code: string): boolean {
  if (filter.subjects?.length && !filter.subjects.includes(subjectOf(code))) return false;
  const level = levelOf(code);
  if (filter.levelMin !== undefined && level < filter.levelMin) return false;
  if (filter.levelMax !== undefined && level > filter.levelMax) return false;
  return !filter.exclude?.includes(code);
}

const sum = (courses: PlannedCourse[]) => courses.reduce((n, c) => n + c.units, 0);

// A leaf that can take more courses when its group is short of units.
interface Taker {
  accepts: (c: PlannedCourse) => boolean;
  cap: number;
  taken: PlannedCourse[];
  refresh: () => void;
}

class Evaluator {
  private free: PlannedCourse[];
  private all: PlannedCourse[];
  readonly duplicates: string[] = [];

  // A course counts as many times as some rule asks for it (COMP4550 twice),
  // otherwise once; later instances in plan order count toward nothing.
  constructor(
    tree: RuleNode[],
    plan: PlannedCourse[],
    private choices: Record<string, string>,
  ) {
    const allowed = new Map<string, number>();
    const walk = (n: RuleNode) => {
      if (n.kind === "courses") for (const c of n.courses) allowed.set(c.code, Math.max(allowed.get(c.code) ?? 1, c.times));
      if (n.kind === "group") n.children.forEach(walk);
      if (n.kind === "choice") n.options.forEach(walk);
    };
    tree.forEach(walk);
    const seen = new Map<string, number>();
    this.all = plan.filter((c) => {
      const n = (seen.get(c.code) ?? 0) + 1;
      seen.set(c.code, n);
      if (n <= (allowed.get(c.code) ?? 1)) return true;
      this.duplicates.push(c.key);
      return false;
    });
    this.free = [...this.all];
  }

  private take(accepts: (c: PlannedCourse) => boolean, limit: number, taken: PlannedCourse[]) {
    for (const course of [...this.free]) {
      if (sum(taken) >= limit) break;
      if (!accepts(course)) continue;
      taken.push(course);
      this.free.splice(this.free.indexOf(course), 1);
    }
  }

  // Evaluates allocating nodes; returns what they took plus leaves that can top up.
  private allocate(node: RuleNode): { result: Result; taken: PlannedCourse[]; takers: Taker[] } {
    const base = { id: node.id, label: node.label, kind: node.kind, note: node.note, children: [] as Result[] };

    switch (node.kind) {
      case "courses": {
        if (node.minUnits === undefined && node.maxUnits === undefined) {
          const taken: PlannedCourse[] = [];
          const missing: string[] = [];
          let met = 0;
          for (const ref of node.courses) {
            const mine: PlannedCourse[] = [];
            this.take((c) => c.code === ref.code, Infinity, mine);
            // give back instances beyond the number of times required
            const extra = mine.splice(ref.times);
            this.free.push(...extra);
            taken.push(...mine);
            if (mine.length >= ref.times) met++;
            else missing.push(ref.times > 1 ? `${ref.code} ×${ref.times}` : ref.code);
          }
          const result: Result = {
            ...base,
            status: met === node.courses.length ? "met" : "unmet",
            done: met,
            required: node.courses.length,
            measure: "courses",
            bound: "min",
            counted: taken.map((c) => c.code),
            missing,
          };
          return { result, taken, takers: [] };
        }
        const codes = new Set(node.courses.map((c) => c.code));
        const accepts = (c: PlannedCourse) => codes.has(c.code);
        return this.leaf(base, accepts, node.minUnits, node.maxUnits, [...codes]);
      }
      case "pool":
        return this.leaf(base, (c) => matches(node, c.code), node.minUnits, node.maxUnits, []);
      case "group":
        return this.group(node);
      case "choice": {
        const options = node.options.map((o) => ({ id: o.id, label: o.label }));
        const picked = node.options.find((o) => o.id === this.choices[node.id]);
        if (!picked) {
          const result: Result = {
            ...base,
            status: "choose",
            done: 0,
            required: 1,
            measure: "parts",
            bound: "min",
            counted: [],
            missing: [],
            options,
          };
          return { result, taken: [], takers: [] };
        }
        const inner = this.allocate(picked);
        const result: Result = {
          ...base,
          status: inner.result.status,
          done: inner.result.done,
          required: inner.result.required,
          measure: inner.result.measure,
          bound: "min",
          counted: inner.result.counted,
          missing: [],
          children: [inner.result],
          options,
          chosen: picked.id,
        };
        return { result, taken: inner.taken, takers: inner.takers };
      }
      default:
        throw new Error(`${node.kind} is not an allocating requirement`);
    }
  }

  private leaf(
    base: Omit<Result, "status" | "done" | "required" | "measure" | "bound" | "counted" | "missing">,
    accepts: (c: PlannedCourse) => boolean,
    minUnits: number | undefined,
    maxUnits: number | undefined,
    listed: string[],
  ) {
    const taken: PlannedCourse[] = [];
    const cap = maxUnits ?? Infinity;
    this.take(accepts, Math.min(minUnits ?? cap, cap), taken);
    const result: Result = {
      ...base,
      status: "met",
      done: 0,
      required: minUnits ?? maxUnits ?? 0,
      measure: "units",
      bound: minUnits === undefined ? "max" : "min",
      counted: [],
      missing: [],
    };
    const refresh = () => refreshLeaf(result, taken, minUnits, listed);
    refresh();
    return { result, taken, takers: [{ accepts, cap, taken, refresh }] };
  }

  private group(node: Extract<RuleNode, { kind: "group" }>) {
    const allocating = node.children.filter((c) => !isCheck(c));
    const results = new Map<string, Result>();
    const taken: PlannedCourse[] = [];
    const takers: Taker[] = [];
    for (const child of allocating) {
      const out = this.allocate(child);
      results.set(child.id, out.result);
      taken.push(...out.taken);
      takers.push(...out.takers);
    }

    if (node.minUnits !== undefined) {
      for (const taker of takers) {
        const short = node.minUnits - sum(taken);
        if (short <= 0) break;
        const before = taker.taken.length;
        this.take(taker.accepts, Math.min(taker.cap, sum(taker.taken) + short), taker.taken);
        taken.push(...taker.taken.slice(before));
        taker.refresh();
      }
    }

    for (const child of node.children.filter(isCheck)) {
      results.set(child.id, this.check(child, taken));
    }
    const children = node.children.map((c) => results.get(c.id) as Result);
    const units = sum(taken);
    const childrenMet = children.every((c) => settled(c.status));
    const goals = children.filter((c) => c.status !== "within" && c.status !== "manual");
    const unitsMet = node.minUnits === undefined || units >= node.minUnits;
    const result: Result = {
      id: node.id,
      label: node.label,
      kind: "group",
      note: node.note,
      status: childrenMet && unitsMet ? "met" : "unmet",
      done: node.minUnits === undefined ? goals.filter((c) => c.status === "met").length : units,
      required: node.minUnits ?? goals.length,
      measure: node.minUnits === undefined ? "parts" : "units",
      bound: "min",
      counted: taken.map((c) => c.code),
      missing: [],
      children,
    };
    return { result, taken, takers };
  }

  // Non-allocating checks: they read courses without claiming them.
  check(node: RuleNode, scope: PlannedCourse[]): Result {
    const base = { id: node.id, label: node.label, kind: node.kind, note: node.note, children: [] as Result[], missing: [] };
    switch (node.kind) {
      case "constraint": {
        const pool = node.scope === "plan" ? this.all : scope;
        const hit = pool.filter((c) => matches(node, c.code));
        const units = sum(hit);
        const isMax = node.minUnits === undefined;
        const ok = (node.minUnits === undefined || units >= node.minUnits) && (node.maxUnits === undefined || units <= node.maxUnits);
        return {
          ...base,
          status: !ok ? "unmet" : isMax ? "within" : "met",
          done: units,
          required: isMax ? (node.maxUnits ?? 0) : node.minUnits!,
          measure: "units",
          bound: isMax ? "max" : "min",
          counted: hit.map((c) => c.code),
        };
      }
      case "total": {
        const units = sum(this.all);
        return {
          ...base,
          status: units >= node.minUnits ? "met" : "unmet",
          done: units,
          required: node.minUnits,
          measure: "units",
          bound: "min",
          counted: [],
        };
      }
      case "electives": {
        const taken: PlannedCourse[] = [];
        this.take((c) => node.levelMin === undefined || levelOf(c.code) >= node.levelMin, node.minUnits, taken);
        const units = sum(taken);
        return {
          ...base,
          status: units >= node.minUnits ? "met" : "unmet",
          done: units,
          required: node.minUnits,
          measure: "units",
          bound: "min",
          counted: taken.map((c) => c.code),
        };
      }
      case "manual":
        return { ...base, status: "manual", done: 0, required: 0, measure: "parts", bound: "min", counted: [] };
      default:
        throw new Error(`${node.kind} is not a check`);
    }
  }

  run(tree: RuleNode[]): Result[] {
    const results = new Map<string, Result>();
    // allocate first, then electives take what's left, then checks read the whole plan
    for (const node of tree.filter((n) => !isCheck(n))) results.set(node.id, this.allocate(node).result);
    for (const node of tree.filter((n) => n.kind === "electives")) results.set(node.id, this.check(node, []));
    for (const node of tree.filter((n) => isCheck(n) && n.kind !== "electives")) results.set(node.id, this.check(node, this.all));
    return tree.map((n) => results.get(n.id) as Result);
  }
}

function refreshLeaf(r: Result, taken: PlannedCourse[], minUnits: number | undefined, listed: string[]) {
  const units = sum(taken);
  r.done = units;
  r.counted = taken.map((c) => c.code);
  r.status = minUnits === undefined ? "within" : units >= minUnits ? "met" : "unmet";
  r.missing = r.status !== "unmet" ? [] : listed.filter((code) => !r.counted.includes(code));
}

const isCheck = (n: RuleNode) => ["constraint", "total", "electives", "manual"].includes(n.kind);

export interface Audit {
  results: Result[];
  duplicates: string[];
  // planned course key -> labels from the top-level requirement down to the list that claimed it
  countedBy: Map<string, string[]>;
}

const CLAIMS: Kind[] = ["courses", "pool", "electives"];

// `plan` must be in the order courses are taken, so the first sitting counts.
export function audit(tree: RuleNode[], plan: PlannedCourse[], choices: Record<string, string> = {}): Audit {
  const evaluator = new Evaluator(tree, plan, choices);
  const results = evaluator.run(tree);
  const duplicates = new Set(evaluator.duplicates);

  const unclaimed = new Map<string, string[]>();
  for (const c of plan) if (!duplicates.has(c.key)) unclaimed.set(c.code, [...(unclaimed.get(c.code) ?? []), c.key]);
  const countedBy = new Map<string, string[]>();
  const walk = (r: Result, path: string[]) => {
    const here = [...path, r.label];
    if (CLAIMS.includes(r.kind)) {
      for (const code of r.counted) {
        const key = unclaimed.get(code)?.shift();
        if (key) countedBy.set(key, here);
      }
    }
    r.children.forEach((child) => walk(child, here));
  };
  results.forEach((r) => walk(r, []));
  return { results, duplicates: evaluator.duplicates, countedBy };
}

export function evaluate(tree: RuleNode[], plan: PlannedCourse[], choices: Record<string, string> = {}): Result[] {
  return audit(tree, plan, choices).results;
}
