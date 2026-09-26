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
    expect(requirement(doc, "AACOM/foundations/programming").classList.contains("req-unmet")).toBe(true);
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

  it("rejects something that isn't a course code and adds nothing", async () => {
    const res = await post("/api/plan/courses", { code: "<b>hi</b>", term: "2027 S1" }, cookie);
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
