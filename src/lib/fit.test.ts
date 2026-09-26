import { describe, expect, it } from "vitest";
import { courseFits, nextSteps } from "./fit";
import { evaluate, type PlannedCourse, type RuleNode } from "./rules";

const refs = (...codes: string[]) => codes.map((code) => ({ code, times: 1 }));
const tree: RuleNode[] = [
  {
    id: "core",
    kind: "group",
    label: "At least 24 units from the following",
    minUnits: 24,
    children: [
      { id: "prog", kind: "courses", label: "COMP1100 or COMP1130", courses: refs("COMP1100", "COMP1130"), minUnits: 6 },
      { id: "comp", kind: "courses", label: "Compulsory courses", courses: refs("COMP1600", "COMP2100") },
      {
        id: "major",
        kind: "choice",
        label: "A computing major",
        options: [
          { id: "soft", kind: "group", label: "Software Development", children: [{ id: "l", kind: "courses", label: "Major list", courses: refs("COMP3500", "COMP2100"), minUnits: 6 }] },
          { id: "ai", kind: "group", label: "Intelligent Systems", children: [{ id: "l", kind: "courses", label: "Major list", courses: refs("COMP3620"), minUnits: 6 }] },
        ],
      },
    ],
  },
  { id: "electives", kind: "electives", label: "Electives", minUnits: 12 },
  { id: "total", kind: "total", label: "Total", minUnits: 36 },
];

describe("how a course fits the plan", () => {
  it("says a course counts when it's listed outside any unchosen option", () => {
    expect(courseFits(tree, {}).get("COMP1600")).toEqual({ kind: "counts", where: "Compulsory courses" });
  });

  it("says a major's course only counts once that major is chosen", () => {
    expect(courseFits(tree, {}).get("COMP3620")).toEqual({ kind: "if-chosen", option: "Intelligent Systems", where: "Intelligent Systems › Major list" });
    expect(courseFits(tree, { major: "ai" }).get("COMP3620")?.kind).toBe("counts");
  });

  it("prefers 'counts' when a course is also compulsory", () => {
    expect(courseFits(tree, {}).get("COMP2100")?.kind).toBe("counts");
  });

  it("knows nothing of courses the rules don't name", () => {
    expect(courseFits(tree, {}).has("ARTH1001")).toBe(false);
  });
});

describe("next steps", () => {
  let n = 0;
  const plan = (...codes: string[]): PlannedCourse[] => codes.map((code) => ({ key: String(n++), code, units: 6 }));

  it("starts with the earliest open requirements, at most three", () => {
    const steps = nextSteps(evaluate(tree, plan()));
    expect(steps.map((s) => s.text)).toEqual([
      "Choose one: COMP1100 or COMP1130",
      "Still needed from Compulsory courses",
      "Pick one: A computing major",
    ]);
    expect(steps[0].codes).toEqual(["COMP1100", "COMP1130"]);
    expect(steps[1].codes).toEqual(["COMP1600", "COMP2100"]);
  });

  it("moves on as requirements are met", () => {
    const steps = nextSteps(evaluate(tree, plan("COMP1100", "COMP1600", "COMP2100")));
    expect(steps[0].text).toBe("Pick one: A computing major");
  });

  it("has nothing to suggest once every requirement is met", () => {
    const done = plan("COMP1100", "COMP1600", "COMP2100", "COMP3620", "ARTH1001", "ARTH1002");
    expect(nextSteps(evaluate(tree, done, { major: "ai" }))).toEqual([]);
  });
});
