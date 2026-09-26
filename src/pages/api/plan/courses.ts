import type { APIRoute } from "astro";
import { addPlanCourse, courseInfo, getDegree, listPlanCourses, termsFor } from "../../../lib/db";
import { flashUrl } from "../../../lib/flash";
import { COURSE_CODE } from "../../../lib/seed";
import { currentPlan } from "../../../lib/session";

const fail = (message: string) => `/?error=${encodeURIComponent(message)}#add`;

// Adds one course chosen from search results (or typed by code as a custom
// course). Free text is never resolved here: the student picks the course.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const plan = currentPlan(cookies);
  const degree = plan && getDegree(plan.degreeCode);
  if (!plan || !degree) return redirect("/", 303);

  const form = await request.formData();
  const code = String(form.get("code") ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const term = String(form.get("term") ?? "");
  if (!COURSE_CODE.test(code)) return redirect(fail("Pick a course from the search results, or enter a code like COMP1100."), 303);
  if (!termsFor(plan, degree).includes(term)) return redirect(fail("Choose a semester from the list."), 303);

  // a catalogued course always uses its published units; only custom courses take typed units
  const known = courseInfo([code]).get(code);
  const units = known ? known.units : Number(String(form.get("units") ?? "").trim() || 6);
  if (!Number.isInteger(units) || units < 1 || units > 24) return redirect(fail("Units must be a whole number from 1 to 24."), 303);

  const existing = listPlanCourses(plan.id).filter((c) => c.courseCode === code);
  if (existing.some((c) => c.term === term)) return redirect(fail(`${code} is already in ${term}.`), 303);

  const id = addPlanCourse(plan.id, code, term, units);
  if (!id) return redirect(fail(`${code} is already in ${term}.`), 303);
  if (form.get("undo")) return redirect(flashUrl({ done: "undone" }), 303);
  return redirect(flashUrl({ done: "added", code, term, id }), 303);
};
