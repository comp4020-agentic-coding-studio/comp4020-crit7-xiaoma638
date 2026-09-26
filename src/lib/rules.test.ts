import { describe, expect, it } from "vitest";
import { audit, evaluate, type PlannedCourse, type Result, type RuleNode } from "./rules";

let n = 0;
const plan = (...codes: (string | [string, number])[]): PlannedCourse[] =>
  codes.map((c) => {
    const [code, units] = typeof c === "string" ? [c, 6] : c;
    return { key: String(n++), code, units };
  });

const find = (results: Result[], id: string): Result => {
  for (const r of results) {
    if (r.id === id) return r;
    const hit = r.children.length ? find(r.children, id) : undefined;
    if (hit) return hit;
  }
  return undefined as unknown as Result;
};
const findDeep = (results: Result[], id: string) => {
  const hit = find(results, id);
  if (!hit) throw new Error(`no result ${id}`);
  return hit;
};

describe("compulsory courses", () => {
  const tree: RuleNode[] = [
    { id: "core", kind: "courses", label: "Core", courses: [{ code: "COMP1100", times: 1 }, { code: "COMP1110", times: 1 }, { code: "COMP2100", times: 1 }] },
  ];

  it("counts completed courses and names the missing ones", () => {
    const [core] = evaluate(tree, plan("COMP1100", "COMP2100"));
    expect(core).toMatchObject({ status: "unmet", done: 2, required: 3, measure: "courses", missing: ["COMP1110"] });
  });

  it("is met when every course is planned", () => {
    const [core] = evaluate(tree, plan("COMP1100", "COMP1110", "COMP2100"));
    expect(core.status).toBe("met");
  });

  it("needs a twice-taken course planned twice", () => {
    const twice: RuleNode[] = [{ id: "cap", kind: "courses", label: "Capstone", courses: [{ code: "COMP4550", times: 2 }] }];
    expect(evaluate(twice, plan(["COMP4550", 12]))[0]).toMatchObject({ status: "unmet", missing: ["COMP4550 ×2"] });
    expect(evaluate(twice, plan(["COMP4550", 12], ["COMP4550", 12]))[0].status).toBe("met");
  });
});

describe("allocation", () => {
  it("never counts one course toward two requirements", () => {
    const tree: RuleNode[] = [
      { id: "core", kind: "courses", label: "Core", courses: [{ code: "COMP8600", times: 1 }] },
      { id: "list", kind: "courses", label: "List", courses: [{ code: "COMP8600", times: 1 }, { code: "COMP8610", times: 1 }], minUnits: 12 },
    ];
    const [core, list] = evaluate(tree, plan("COMP8600", "COMP8610"));
    expect(core.status).toBe("met");
    expect(list).toMatchObject({ status: "unmet", done: 6, counted: ["COMP8610"] });
  });

  it("gives unclaimed courses to electives, respecting a level floor", () => {
    const tree: RuleNode[] = [
      { id: "core", kind: "courses", label: "Core", courses: [{ code: "COMP6442", times: 1 }] },
      { id: "electives", kind: "electives", label: "Electives", minUnits: 12, levelMin: 6000 },
    ];
    const [, electives] = evaluate(tree, plan("COMP6442", "ARTH1001", "ECON8013"));
    expect(electives).toMatchObject({ status: "unmet", done: 6, required: 12, counted: ["ECON8013"] });
  });

  it("lets a pool take only matching, non-excluded courses", () => {
    const tree: RuleNode[] = [
      { id: "pool", kind: "pool", label: "4000 COMP", subjects: ["COMP"], levelMin: 4000, levelMax: 4000, exclude: ["COMP4500"], minUnits: 12 },
    ];
    const [pool] = evaluate(tree, plan("COMP4500", "COMP3600", "MATH4343", "COMP4620"));
    expect(pool).toMatchObject({ status: "unmet", done: 6, counted: ["COMP4620"] });
  });
});

describe("lists with limits inside a bundle", () => {
  // shaped like a 24-unit specialisation: ≥12 from the advanced list,
  // ≤12 from the intro list, ≥12 units at 4000 level within the bundle
  const spec: RuleNode = {
    id: "spec",
    kind: "group",
    label: "Spec",
    minUnits: 24,
    children: [
      { id: "adv", kind: "courses", label: "Advanced", minUnits: 12, courses: ["COMP4620", "COMP4650", "COMP4670"].map((code) => ({ code, times: 1 })) },
      { id: "intro", kind: "courses", label: "Intro", maxUnits: 12, courses: ["COMP3620", "COMP3670", "COMP2620"].map((code) => ({ code, times: 1 })) },
      { id: "level", kind: "constraint", label: "4000-level", scope: "parent", levelMin: 4000, minUnits: 12 },
    ],
  };

  it("caps a max-only list and tops the group up from the open list", () => {
    const results = evaluate([spec], plan("COMP3620", "COMP3670", "COMP2620", "COMP4620", "COMP4650", "COMP4670"));
    expect(findDeep(results, "intro")).toMatchObject({ done: 12, bound: "max", status: "within" });
    expect(findDeep(results, "adv").done).toBe(12);
    expect(findDeep(results, "spec")).toMatchObject({ status: "met", done: 24 });
  });

  it("tops up beyond a list's minimum when the capped list can't fill the bundle", () => {
    const results = evaluate([spec], plan("COMP3620", "COMP4620", "COMP4650", "COMP4670"));
    expect(findDeep(results, "adv").done).toBe(18);
    expect(findDeep(results, "spec")).toMatchObject({ status: "met", done: 24 });
  });

  it("scopes a level check to the bundle's own courses", () => {
    const tree: RuleNode[] = [
      { id: "other", kind: "courses", label: "Other", courses: [{ code: "COMP4450", times: 1 }] },
      spec,
    ];
    const results = evaluate(tree, plan("COMP4450", "COMP3620", "COMP3670", "COMP4620", "COMP2620"));
    const level = findDeep(results, "level");
    expect(level).toMatchObject({ done: 6, status: "unmet" });
  });
});

describe("choices", () => {
  const tree: RuleNode[] = [
    {
      id: "cap",
      kind: "choice",
      label: "Capstone",
      options: [
        { id: "research", kind: "group", label: "Research", children: [{ id: "r", kind: "courses", label: "R", courses: [{ code: "COMP4550", times: 2 }] }] },
        { id: "intern", kind: "group", label: "Internship", children: [{ id: "i", kind: "courses", label: "I", courses: [{ code: "COMP4820", times: 1 }] }] },
      ],
    },
    { id: "electives", kind: "electives", label: "Electives", minUnits: 24 },
  ];
  const courses = plan(["COMP4820", 12]);

  it("asks the student to choose, and claims nothing until they do", () => {
    const [cap, electives] = evaluate(tree, courses);
    expect(cap).toMatchObject({ status: "choose", options: [{ id: "research" }, { id: "intern" }] });
    expect(electives.done).toBe(12);
  });

  it("evaluates only the chosen option", () => {
    const [cap, electives] = evaluate(tree, courses, { cap: "intern" });
    expect(cap).toMatchObject({ status: "met", chosen: "intern" });
    expect(electives.done).toBe(0);
  });
});

describe("whole-plan checks", () => {
  const tree: RuleNode[] = [
    { id: "max1000", kind: "constraint", label: "1000-level", scope: "plan", levelMax: 1000, maxUnits: 12 },
    { id: "tps", kind: "manual", label: "TPS" },
    { id: "total", kind: "total", label: "Total", minUnits: 24 },
  ];

  it("flags a level maximum once exceeded", () => {
    const [max] = evaluate(tree, plan("COMP1100", "COMP1110", "MATH1005"));
    expect(max).toMatchObject({ status: "unmet", done: 18, required: 12, bound: "max" });
  });

  it("never reports an untouched upper limit as met", () => {
    expect(evaluate(tree, plan())[0]).toMatchObject({ status: "within", done: 0 });
  });

  it("doesn't count a respected limit as a part achieved", () => {
    const group: RuleNode[] = [
      {
        id: "g",
        kind: "group",
        label: "G",
        children: [
          { id: "core", kind: "courses", label: "Core", courses: [{ code: "COMP1100", times: 1 }] },
          { id: "cap", kind: "courses", label: "Cap", maxUnits: 12, courses: [{ code: "COMP2620", times: 1 }] },
        ],
      },
    ];
    expect(evaluate(group, plan())[0]).toMatchObject({ status: "unmet", done: 0, required: 1 });
    expect(evaluate(group, plan("COMP1100"))[0]).toMatchObject({ status: "met", done: 1, required: 1 });
  });

  it("never marks a manual requirement as met", () => {
    expect(evaluate(tree, plan())[1].status).toBe("manual");
  });

  it("totals every planned unit", () => {
    const total = evaluate(tree, plan("COMP1100", "COMP2100", ["COMP4550", 12]))[2];
    expect(total).toMatchObject({ status: "met", done: 24 });
  });
});

describe("repeated courses", () => {
  const tree: RuleNode[] = [
    { id: "core", kind: "courses", label: "Core", courses: [{ code: "COMP1100", times: 1 }] },
    { id: "cap", kind: "courses", label: "Capstone", courses: [{ code: "COMP4550", times: 2 }] },
    { id: "electives", kind: "electives", label: "Electives", minUnits: 12 },
    { id: "total", kind: "total", label: "Total", minUnits: 48 },
  ];

  it("counts an ordinary course once, however many times it's planned", () => {
    const courses = plan("COMP1100", "COMP1100");
    const out = audit(tree, courses);
    expect(out.duplicates).toEqual([courses[1].key]);
    expect(out.results.find((r) => r.id === "electives")?.done).toBe(0);
    expect(out.results.find((r) => r.id === "total")?.done).toBe(6);
  });

  it("counts a take-twice course twice, and a third time not at all", () => {
    const courses = plan(["COMP4550", 12], ["COMP4550", 12], ["COMP4550", 12]);
    const out = audit(tree, courses);
    expect(out.results.find((r) => r.id === "cap")?.status).toBe("met");
    expect(out.duplicates).toEqual([courses[2].key]);
    expect(out.results.find((r) => r.id === "total")?.done).toBe(24);
  });

  it("counts a course a pool accepts once too", () => {
    const pool: RuleNode[] = [{ id: "p", kind: "pool", label: "COMP", subjects: ["COMP"], minUnits: 12 }];
    const out = audit(pool, plan("COMP3600", "COMP3600"));
    expect(out.results[0]).toMatchObject({ done: 6, status: "unmet" });
  });
});

describe("what each course counts toward, under a unit wrapper", () => {
  it("leaves out a top-level 'N units from the blocks below' wrapper", () => {
    const tree: RuleNode[] = [
      {
        id: "core",
        kind: "group",
        label: "At least 12 units from the following",
        minUnits: 12,
        children: [
          { id: "comp", kind: "courses", label: "Compulsory courses", courses: [{ code: "COMP1600", times: 1 }] },
          { id: "pick", kind: "courses", label: "One of", courses: [{ code: "MATH1005", times: 1 }], minUnits: 6 },
        ],
      },
    ];
    const courses = plan("COMP1600");
    expect(audit(tree, courses).countedBy.get(courses[0].key)).toEqual(["Compulsory courses"]);
  });
});

describe("what each course counts toward", () => {
  const tree: RuleNode[] = [
    {
      id: "found",
      kind: "group",
      label: "Foundations",
      children: [{ id: "prog", kind: "courses", label: "COMP1100 or COMP1130", courses: [{ code: "COMP1100", times: 1 }, { code: "COMP1130", times: 1 }], minUnits: 6 }],
    },
    { id: "electives", kind: "electives", label: "Electives", minUnits: 6 },
    { id: "max", kind: "constraint", label: "1000-level", scope: "plan", levelMax: 1000, maxUnits: 60 },
  ];

  it("names the path to the list that claimed each course, and nothing for the rest", () => {
    const courses = plan("COMP1100", "ARTH1001", "COMP1130", "COMP1100");
    const { countedBy } = audit(tree, courses);
    expect(countedBy.get(courses[0].key)).toEqual(["Foundations", "COMP1100 or COMP1130"]);
    expect(countedBy.get(courses[1].key)).toEqual(["Electives"]);
    expect(countedBy.has(courses[2].key)).toBe(false);
    expect(countedBy.has(courses[3].key)).toBe(false);
  });
});
