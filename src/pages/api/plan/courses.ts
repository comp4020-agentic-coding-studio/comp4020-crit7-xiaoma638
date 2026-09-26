import type { APIRoute } from "astro";
import { addPlanCourse, courseInfo, getDegree, searchCourses, termsFor } from "../../../lib/db";
import { COURSE_CODE } from "../../../lib/seed";
import { currentPlan } from "../../../lib/session";

const back = (error?: string) => (error ? `/?error=${encodeURIComponent(error)}#add` : "/");

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const plan = currentPlan(cookies);
  if (!plan) return redirect("/", 303);
  const degree = getDegree(plan.degreeCode);
  if (!degree) return redirect("/", 303);

  const form = await request.formData();
  const typedCourse = String(form.get("code") ?? "").trim();
  const term = String(form.get("term") ?? "");
  if (!termsFor(plan, degree).includes(term)) return redirect(back("Choose a semester from the list."), 303);

  // a code is added as typed; anything else is a search, added only if it names one course
  let code = typedCourse.toUpperCase().replace(/\s+/g, "");
  if (!COURSE_CODE.test(code)) {
    const hits = searchCourses(typedCourse);
    if (hits.length === 0) return redirect(back(`No course code or title matches "${typedCourse}".`), 303);
    if (hits.length > 1) return redirect(`/?q=${encodeURIComponent(typedCourse)}&term=${encodeURIComponent(term)}#add`, 303);
    code = hits[0].code;
  }

  const known = courseInfo([code]).get(code);
  const typed = String(form.get("units") ?? "").trim();
  const units = typed ? Number(typed) : (known?.units ?? 6);
  if (!Number.isInteger(units) || units < 1 || units > 24) return redirect(back("Units must be a whole number from 1 to 24."), 303);

  addPlanCourse(plan.id, code, term, units);
  return redirect(back(), 303);
};
