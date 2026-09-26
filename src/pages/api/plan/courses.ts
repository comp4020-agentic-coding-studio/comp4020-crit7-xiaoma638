import type { APIRoute } from "astro";
import { addPlanCourse, courseInfo, getDegree, termsFor } from "../../../lib/db";
import { COURSE_CODE } from "../../../lib/seed";
import { currentPlan } from "../../../lib/session";

const back = (error?: string) => (error ? `/?error=${encodeURIComponent(error)}#add` : "/");

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const plan = currentPlan(cookies);
  if (!plan) return redirect("/", 303);
  const degree = getDegree(plan.degreeCode);
  if (!degree) return redirect("/", 303);

  const form = await request.formData();
  const code = String(form.get("code") ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const term = String(form.get("term") ?? "");
  if (!COURSE_CODE.test(code)) return redirect(back(`"${code}" isn't a course code — use four letters and four digits, like COMP1100.`), 303);
  if (!termsFor(plan, degree).includes(term)) return redirect(back("Choose a semester from the list."), 303);

  const known = courseInfo([code]).get(code);
  const typed = String(form.get("units") ?? "").trim();
  const units = typed ? Number(typed) : (known?.units ?? 6);
  if (!Number.isInteger(units) || units < 1 || units > 24) return redirect(back("Units must be a whole number from 1 to 24."), 303);

  addPlanCourse(plan.id, code, term, units);
  return redirect(back(), 303);
};
