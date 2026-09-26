import { describe, expect, it } from "vitest";
import type { RuleNode } from "./rules";
import { type CourseInfo, loadCatalogue } from "./seed";

const catalogue = loadCatalogue();

// The units a requirement asks for, so a degree's top level can be checked
// against its published total — the cheapest guard against a mistyped block.
function nominal(node: RuleNode, courses: Map<string, CourseInfo>): number {
  switch (node.kind) {
    case "group":
      return node.minUnits ?? node.children.reduce((n, c) => n + nominal(c, courses), 0);
    case "courses":
      if (node.minUnits !== undefined) return node.minUnits;
      if (node.maxUnits !== undefined) return 0;
      return node.courses.reduce((n, c) => n + (courses.get(c.code)?.units ?? 6) * c.times, 0);
    case "pool":
    case "electives":
      return node.minUnits;
    case "choice":
      return Math.max(...node.options.map((o) => nominal(o, courses)));
    default:
      return 0;
  }
}

function walk(nodes: RuleNode[], visit: (n: RuleNode) => void) {
  for (const n of nodes) {
    visit(n);
    if (n.kind === "group") walk(n.children, visit);
    if (n.kind === "choice") walk(n.options, visit);
  }
}

describe("seed data", () => {
  it("has degrees", () => {
    expect(catalogue.degrees.length).toBeGreaterThan(0);
  });

  for (const degree of catalogue.degrees) {
    describe(degree.code, () => {
      it("cites its 2027 P&C page", () => {
        expect(degree.sourceUrl).toMatch(/^https:\/\/programsandcourses\.anu\.edu\.au\/2027\//);
      });

      it("top-level requirements add up to the degree total", () => {
        const units = degree.tree.reduce((n, r) => n + nominal(r, catalogue.courses), 0);
        expect(units).toBe(degree.totalUnits);
      });

      it("every choice's options ask for the same units", () => {
        walk(degree.tree, (n) => {
          if (n.kind !== "choice") return;
          const sizes = new Set(n.options.map((o) => nominal(o, catalogue.courses)));
          expect(sizes.size, n.id).toBe(1);
        });
      });

      it("every listed course has a title and units in the catalogue", () => {
        walk(degree.tree, (n) => {
          if (n.kind !== "courses") return;
          for (const c of n.courses) expect(catalogue.courses.has(c.code), `${n.id}: ${c.code}`).toBe(true);
        });
      });

      it("declares undergraduate or postgraduate", () => {
        expect(["undergraduate", "postgraduate"]).toContain(degree.level);
      });

      it("has a total-units check", () => {
        expect(degree.tree.some((n) => n.kind === "total")).toBe(true);
      });
    });
  }
});
