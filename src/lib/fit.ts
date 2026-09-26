import type { Result, RuleNode } from "./rules";

// How a course would fit this plan, from where the degree's rules name it.
export type Fit =
  | { kind: "counts"; where: string }
  | { kind: "if-chosen"; option: string; where: string }
  | { kind: "other" };

const short = (path: string[]) => path.slice(-2).join(" › ");

export function courseFits(tree: RuleNode[], choices: Record<string, string>): Map<string, Fit> {
  const fits = new Map<string, Fit>();
  const walk = (nodes: RuleNode[], path: string[], unchosen?: string) => {
    for (const n of nodes) {
      const wrapper = path.length === 0 && n.kind === "group" && n.minUnits !== undefined;
      const here = wrapper ? path : [...path, n.label];
      if (n.kind === "courses") {
        for (const c of n.courses) {
          const had = fits.get(c.code);
          if (had?.kind === "counts") continue;
          if (!unchosen) fits.set(c.code, { kind: "counts", where: short(here) });
          else if (!had) fits.set(c.code, { kind: "if-chosen", option: unchosen, where: short(here) });
        }
      }
      if (n.kind === "group") walk(n.children, here, unchosen);
      if (n.kind === "choice") {
        for (const o of n.options) walk([o], here, unchosen ?? (choices[n.id] === o.id ? undefined : o.label));
      }
    }
  };
  walk(tree, []);
  return fits;
}

export interface Step {
  text: string;
  codes: string[];
}

// The next few concrete things to do, in rule order, from what's still missing.
export function nextSteps(results: Result[], limit = 3): Step[] {
  const steps: Step[] = [];
  const shortBy = (r: Result) => r.required - r.done;
  const visit = (r: Result) => {
    if (r.status !== "unmet" && r.status !== "choose") return;
    switch (r.kind) {
      case "choice":
        if (r.status === "choose") steps.push({ text: `Pick one: ${r.label}`, codes: [] });
        else r.children.forEach(visit);
        return;
      case "group": {
        const before = steps.length;
        r.children.forEach(visit);
        if (steps.length === before && r.measure === "units") {
          steps.push({ text: `Add ${shortBy(r)} more units toward ${r.label}`, codes: [] });
        }
        return;
      }
      case "courses":
        if (r.measure === "courses") {
          steps.push({ text: `Still needed from ${r.label}`, codes: r.missing.map((m) => m.split(" ")[0]) });
        } else if (r.missing.length && r.missing.length <= 3) {
          steps.push({ text: `Choose one: ${r.label}`, codes: r.missing });
        } else {
          steps.push({ text: `Add ${shortBy(r)} more units from ${r.label}`, codes: r.missing.slice(0, 4) });
        }
        return;
      case "pool":
        steps.push({ text: `Add ${shortBy(r)} more units of ${r.label}`, codes: [] });
        return;
      case "electives":
        steps.push({ text: `Add ${shortBy(r)} more elective units`, codes: [] });
        return;
      case "constraint":
        steps.push({ text: `Add ${shortBy(r)} more units of ${r.label}`, codes: [] });
        return;
    }
  };
  // specific requirements first; the running total only once nothing else is left
  results.filter((r) => r.kind !== "total").forEach(visit);
  if (!steps.length) results.filter((r) => r.kind === "total").forEach((r) => r.status === "unmet" && steps.push({ text: `Add ${shortBy(r)} more units in total`, codes: [] }));
  return steps.slice(0, limit);
}

export function describeFit(fit: Fit | undefined, degreeCode: string): string {
  if (fit?.kind === "counts") return `Counts toward ${fit.where}`;
  if (fit?.kind === "if-chosen") return `Could count if you choose ${fit.option}`;
  return `Not in ${degreeCode}'s requirement lists — would only count as a general elective`;
}
