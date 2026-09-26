import type { APIRoute } from "astro";
import { getDegree, getPlanCourse, movePlanCourse, termsFor } from "../../../../lib/db";
import { flashUrl } from "../../../../lib/flash";
import { currentPlan } from "../../../../lib/session";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const plan = currentPlan(cookies);
  const degree = plan && getDegree(plan.degreeCode);
  if (!plan || !degree) return redirect("/", 303);
  const form = await request.formData();
  const course = getPlanCourse(plan.id, Number(form.get("id")));
  const term = String(form.get("term") ?? "");
  if (!course || !termsFor(plan, degree).includes(term)) return redirect("/", 303);
  if (!movePlanCourse(plan.id, course.id, term)) {
    return redirect(`/?error=${encodeURIComponent(`${course.courseCode} is already planned in ${term}.`)}`, 303);
  }
  if (form.get("undo")) return redirect(flashUrl({ done: "undone" }), 303);
  return redirect(flashUrl({ done: "moved", code: course.courseCode, term, from: course.term, id: course.id }), 303);
};
