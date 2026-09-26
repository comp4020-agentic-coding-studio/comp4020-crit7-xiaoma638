import type { APIRoute } from "astro";
import { getPlanCourse, removePlanCourse } from "../../../../lib/db";
import { flashUrl } from "../../../../lib/flash";
import { currentPlan } from "../../../../lib/session";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const plan = currentPlan(cookies);
  if (!plan) return redirect("/", 303);
  const form = await request.formData();
  const course = getPlanCourse(plan.id, Number(form.get("id")));
  if (!course) return redirect("/", 303);
  removePlanCourse(plan.id, course.id);
  if (form.get("undo")) return redirect(flashUrl({ done: "undone" }), 303);
  return redirect(flashUrl({ done: "removed", code: course.courseCode, term: course.term, units: course.units }), 303);
};
