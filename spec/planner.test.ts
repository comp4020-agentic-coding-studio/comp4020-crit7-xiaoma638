import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, inject, it } from "vitest";

// The crit 7 contract, driven over HTTP against the built server: a plan is
// created, a course added to a semester survives a fresh page load, and the
// requirements panel reflects it. Asserts what the page shows, not how it's built.
const baseUrl = inject("baseUrl");

// Astro checks form POSTs carry a same-origin Origin header; browsers send it.
async function post(path: string, fields: Record<string, string>, cookie?: string) {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl, ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

async function page(path: string, cookie?: string) {
  const res = await fetch(new URL(path, baseUrl), { headers: cookie ? { cookie } : {} });
  expect(res.status).toBe(200);
  return new JSDOM(await res.text()).window.document;
}

async function startPlan(degree: string, extra: Record<string, string> = {}) {
  const res = await post("/api/plans", { degree, ...extra });
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/");
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toMatch(/^plan=.+/);
  return cookie as string;
}

const requirement = (doc: Document, id: string) => {
  const el = doc.querySelector(`[data-requirement="${id}"]`);
  if (!el) throw new Error(`requirement ${id} not on the page`);
  return el;
};
const coursesIn = (doc: Document, term: string) =>
  [...(doc.querySelector(`section[aria-label="${term}"]`)?.querySelectorAll("[data-course]") ?? [])].map((li) =>
    li.getAttribute("data-course"),
  );

describe("a degree plan", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await startPlan("AACOM");
  });

  it("opens on the chosen degree with nothing met yet", async () => {
    const doc = await page("/", cookie);
    expect(doc.querySelector("h1")?.textContent).toContain("Bachelor of Advanced Computing (Honours)");
    expect(requirement(doc, "AACOM/foundations/programming").classList.contains("req-missing")).toBe(true);
    // an upper limit with no courses planned is respected, not achieved
    expect(requirement(doc, "AACOM/max-1000").classList.contains("req-met")).toBe(false);
    expect(doc.querySelector(".summary")?.textContent).toMatch(/^0 of \d+ requirements met/);
  });

  it("plans in the year the rules are from, whatever year is asked for", async () => {
    const doc = await page("/", await startPlan("AACOM", { startYear: "2021" }));
    expect(doc.querySelector('section[aria-label="2027 S1"]')).toBeTruthy();
    expect(doc.querySelector('section[aria-label="2021 S1"]')).toBeNull();
  });

  it("keeps an added course across a reload and marks its requirement met", async () => {
    const res = await post("/api/plan/courses", { code: "comp 1100", term: "2027 S1" }, cookie);
    expect(res.status).toBe(303);

    const doc = await page("/", cookie);
    expect(coursesIn(doc, "2027 S1")).toContain("COMP1100");
    expect(requirement(doc, "AACOM/foundations/programming").classList.contains("req-met")).toBe(true);
  });

  it("says which requirement each planned course counts toward", async () => {
    const doc = await page("/", cookie);
    const counts = doc.querySelector('section[aria-label="2027 S1"] [data-course="COMP1100"] [data-counts]');
    expect(counts?.textContent).toContain("Foundations");
    expect(counts?.textContent).toContain("COMP1100 or COMP1130");
  });

  it("shows unit progress toward a requirement", async () => {
    await post("/api/plan/courses", { code: "INFS2024", term: "2027 S2" }, cookie);
    const doc = await page("/", cookie);
    const ict = requirement(doc, "AACOM/ict");
    expect(ict.querySelector(".req-progress")?.textContent).toContain("6/12 units");
    expect(ict.querySelector(".req-progress")?.textContent).toContain("6 missing");
  });

  it("removes a course", async () => {
    const doc = await page("/", cookie);
    const id = doc.querySelector('[data-course="INFS2024"] input[name="id"]')?.getAttribute("value");
    expect(id).toBeTruthy();
    await post("/api/plan/courses/delete", { id: id as string }, cookie);
    expect(coursesIn(await page("/", cookie), "2027 S2")).not.toContain("INFS2024");
  });

  it("remembers a specialisation choice", async () => {
    const before = await page("/", cookie);
    const select = requirement(before, "AACOM/spec").querySelector("select");
    const option = [...(select?.querySelectorAll("option") ?? [])].map((o) => o.getAttribute("value")).find(Boolean);
    expect(option).toBeTruthy();

    await post("/api/plan/choices", { choice: "AACOM/spec", option: option as string }, cookie);
    const after = await page("/", cookie);
    const chosen = requirement(after, "AACOM/spec").querySelector("option[selected]")?.getAttribute("value");
    expect(chosen).toBe(option);
  });

  it("counts a course planned twice only once", async () => {
    const units = (doc: Document) => Number(doc.querySelector(".summary")?.textContent?.match(/(\d+)\/192 units/)?.[1]);
    const before = units(await page("/", cookie));
    await post("/api/plan/courses", { code: "COMP1100", term: "2028 S1" }, cookie);
    const doc = await page("/", cookie);
    expect(doc.querySelector('section[aria-label="2028 S1"] [data-course="COMP1100"]')?.hasAttribute("data-duplicate")).toBe(true);
    expect(doc.querySelector('section[aria-label="2027 S1"] [data-course="COMP1100"]')?.hasAttribute("data-duplicate")).toBe(false);
    expect(units(doc)).toBe(before);

    const id = doc.querySelector('section[aria-label="2028 S1"] [data-course="COMP1100"] input[name="id"]')?.getAttribute("value");
    await post("/api/plan/courses/delete", { id: id as string }, cookie);
  });

  it("moves a course to another semester, keeping it across a reload", async () => {
    const before = await page("/", cookie);
    const id = before.querySelector('section[aria-label="2027 S1"] [data-course="COMP1100"] input[name="id"]')?.getAttribute("value");
    const res = await post("/api/plan/courses/move", { id: id as string, term: "2027 S2" }, cookie);
    expect(res.status).toBe(303);

    const after = await page("/", cookie);
    expect(coursesIn(after, "2027 S1")).not.toContain("COMP1100");
    expect(after.querySelector('section[aria-label="2027 S2"] [data-course="COMP1100"] input[name="id"]')?.getAttribute("value")).toBe(id);
    expect(requirement(after, "AACOM/foundations/programming").classList.contains("req-met")).toBe(true);

    await post("/api/plan/courses/move", { id: id as string, term: "2027 S1" }, cookie);
  });

  it("won't move a course into a semester that already has it", async () => {
    await post("/api/plan/courses", { code: "COMP1100", term: "2028 S1" }, cookie);
    const doc = await page("/", cookie);
    const later = doc.querySelector('section[aria-label="2028 S1"] [data-course="COMP1100"] input[name="id"]')?.getAttribute("value");
    const res = await post("/api/plan/courses/move", { id: later as string, term: "2027 S1" }, cookie);
    expect(res.headers.get("location")).toContain("error=");
    expect(coursesIn(await page("/", cookie), "2028 S1")).toContain("COMP1100");
    await post("/api/plan/courses/delete", { id: later as string }, cookie);
  });

  it("recounts after a move: the earlier sitting is the one that counts", async () => {
    await post("/api/plan/courses", { code: "COMP1110", term: "2028 S1" }, cookie);
    await post("/api/plan/courses", { code: "COMP1110", term: "2028 S2" }, cookie);
    const flagged = (doc: Document, term: string) =>
      doc.querySelector(`section[aria-label="${term}"] [data-course="COMP1110"]`)?.hasAttribute("data-duplicate");
    let doc = await page("/", cookie);
    expect([flagged(doc, "2028 S1"), flagged(doc, "2028 S2")]).toEqual([false, true]);

    const second = doc.querySelector('section[aria-label="2028 S2"] [data-course="COMP1110"] input[name="id"]')?.getAttribute("value");
    await post("/api/plan/courses/move", { id: second as string, term: "2027 S2" }, cookie);
    doc = await page("/", cookie);
    expect([flagged(doc, "2027 S2"), flagged(doc, "2028 S1")]).toEqual([false, true]);

    for (const li of doc.querySelectorAll('[data-course="COMP1110"] input[name="id"]')) {
      await post("/api/plan/courses/delete", { id: li.getAttribute("value") as string }, cookie);
    }
    doc = await page("/", cookie);
    expect(requirement(doc, "AACOM/foundations/structured").classList.contains("req-missing")).toBe(true);
  });

  it("finds courses by name, degree courses first, each with its own Add", async () => {
    const doc = await page("/?q=software", cookie);
    const headings = [...doc.querySelectorAll("#results .results-heading")].map((h) => h.textContent);
    expect(headings).toEqual(["In your degree", "Other courses"]);
    const lists = doc.querySelectorAll("#results .result-list");
    const row = lists[0].querySelector('[data-result="COMP2100"]');
    expect(row?.textContent).toContain("Software Construction");
    expect(row?.textContent).toContain("6u");
    expect(row?.querySelector(".fit")?.textContent).toContain("Counts toward");
    expect(row?.querySelector('form input[name="code"]')?.getAttribute("value")).toBe("COMP2100");
    expect(row?.querySelector('form select[name="term"]')).toBeTruthy();
    expect(lists[1].querySelector('[data-result="COMP6442"] .fit')?.textContent).toContain("general elective");
  });

  it("adds the result the student picked, to the semester they picked", async () => {
    const doc = await page("/?q=games graphs", cookie);
    const code = doc.querySelector('#results [data-result] input[name="code"]')?.getAttribute("value");
    expect(code).toBe("MATH2301");
    await post("/api/plan/courses", { code: code as string, term: "2027 S2" }, cookie);
    const after = await page("/", cookie);
    expect(coursesIn(after, "2027 S2")).toContain("MATH2301");
    const id = after.querySelector('section[aria-label="2027 S2"] [data-course="MATH2301"] input[name="id"]')?.getAttribute("value");
    await post("/api/plan/courses/delete", { id: id as string }, cookie);
  });

  it("never adds free text, even when it names one course", async () => {
    const res = await post("/api/plan/courses", { code: "games, graphs and machines", term: "2027 S2" }, cookie);
    expect(res.headers.get("location")).toContain("error=");
    expect(coursesIn(await page("/", cookie), "2027 S2")).not.toContain("MATH2301");
  });

  it("uses a known course's published units, whatever is typed", async () => {
    await post("/api/plan/courses", { code: "COMP2300", term: "2029 S1", units: "24" }, cookie);
    const doc = await page("/", cookie);
    const course = doc.querySelector('section[aria-label="2029 S1"] [data-course="COMP2300"]');
    expect(course?.querySelector(".units")?.textContent).toBe("6u");
    await post("/api/plan/courses/delete", { id: course?.querySelector('input[name="id"]')?.getAttribute("value") as string }, cookie);
  });

  it("takes typed units only for a course it doesn't know", async () => {
    await post("/api/plan/courses", { code: "ZZZZ1234", term: "2029 S1", units: "12" }, cookie);
    const doc = await page("/", cookie);
    const course = doc.querySelector('section[aria-label="2029 S1"] [data-course="ZZZZ1234"]');
    expect(course?.querySelector(".units")?.textContent).toBe("12u");
    await post("/api/plan/courses/delete", { id: course?.querySelector('input[name="id"]')?.getAttribute("value") as string }, cookie);
  });

  it("offers only first and second semesters", async () => {
    const doc = await page("/", cookie);
    const terms = [...doc.querySelectorAll('#add select[name="term"] option')].map((o) => o.textContent);
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.every((t) => /^\d{4} S[12]$/.test(t ?? ""))).toBe(true);
    const res = await post("/api/plan/courses", { code: "COMP1110", term: "2027 Summer" }, cookie);
    expect(res.headers.get("location")).toContain("error=");
  });

  it("rejects something that isn't a course code and adds nothing", async () => {
    const res = await post("/api/plan/courses", { code: "<b>zzqx</b>", term: "2027 S1" }, cookie);
    expect(res.headers.get("location")).toContain("error=");
    expect(coursesIn(await page("/", cookie), "2027 S1")).toEqual(["COMP1100"]);
  });

  it("keeps each browser's plan to itself", async () => {
    const other = await startPlan("AACOM");
    expect(coursesIn(await page("/", other), "2027 S1")).toEqual([]);
  });
});

describe("every degree on offer", () => {
  it("can be planned", async () => {
    const doc = await page("/");
    const codes = [...doc.querySelectorAll('select[name="degree"] option')]
      .map((o) => o.getAttribute("value") as string)
      .filter(Boolean);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const plan = await page("/", await startPlan(code));
      expect(plan.querySelector(`[data-requirement="${code}/total"]`), code).toBeTruthy();
    }
  });
});

describe("next steps", () => {
  it("leads with at most three concrete steps and keeps the full audit closed", async () => {
    const doc = await page("/", await startPlan("AACOM"));
    const steps = [...doc.querySelectorAll(".next .steps > li")];
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.length).toBeLessThanOrEqual(3);
    expect(steps[0].textContent).toContain("COMP1100 or COMP1130");
    expect(steps[0].querySelector('a[data-add="COMP1100"]')).toBeTruthy();
    expect(doc.querySelector("#audit")?.hasAttribute("open")).toBe(false);
  });
});

describe("courses from an unchosen major", () => {
  it("say they could count, not that they do, until the major is chosen", async () => {
    const cookie = await startPlan("BCOMP");
    const fit = async () => (await page("/?q=COMP3500", cookie)).querySelector('[data-result="COMP3500"] .fit')?.textContent;
    expect(await fit()).toContain("Could count if you choose");

    const doc = await page("/", cookie);
    const option = [...doc.querySelectorAll('[data-requirement="BCOMP/core/computing"] option')]
      .find((o) => o.getAttribute("value")?.endsWith("SOFT-MAJ"))
      ?.getAttribute("value");
    await post("/api/plan/choices", { choice: "BCOMP/core/computing", option: option as string }, cookie);
    expect(await fit()).toContain("Counts toward");
  });
});

describe("the degree list", () => {
  it("groups degrees by level, with MMLCV under postgraduate", async () => {
    const doc = await page("/");
    const group = (label: string) =>
      [...(doc.querySelector(`optgroup[label="${label}"]`)?.querySelectorAll("option") ?? [])].map((o) => o.getAttribute("value"));
    expect(group("Postgraduate")).toContain("MMLCV");
    expect(group("Undergraduate")).not.toContain("MMLCV");
    expect(group("Undergraduate")).toContain("BCOMP");
  });
});

describe("without a plan", () => {
  it("offers the degree choice on the same page as the planner", async () => {
    const doc = await page("/");
    expect(doc.querySelector('select[name="degree"]')).toBeTruthy();
    expect(doc.querySelector("[data-requirement]")).toBeNull();
  });
});

describe("with a plan", () => {
  it("lets the student switch degree from the planner, keeping their courses", async () => {
    const cookie = await startPlan("BCOMP");
    await post("/api/plan/courses", { code: "COMP1100", term: "2027 S1" }, cookie);
    const planner = await page("/", cookie);
    expect(planner.querySelector('select[name="degree"] option[selected]')?.getAttribute("value")).toBe("BCOMP");

    await post("/api/plans", { degree: "AACOM" }, cookie);
    const after = await page("/", cookie);
    expect(after.querySelector("h1")?.textContent).toContain("Advanced Computing");
    expect(coursesIn(after, "2027 S1")).toContain("COMP1100");
  });

  it("still answers at the old /plan address", async () => {
    const res = await fetch(new URL("/plan", baseUrl), { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/");
  });
});
