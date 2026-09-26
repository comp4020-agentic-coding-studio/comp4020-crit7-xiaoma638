import type { APIRoute } from "astro";
import { getDegree, movePlanCourse, termsFor } from "../../../../lib/db";
import { currentPlan } from "../../../../lib/session";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const plan = currentPlan(cookies);
  const degree = plan && getDegree(plan.degreeCode);
  if (!plan || !degree) return redirect("/", 303);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const term = String(form.get("term") ?? "");
  if (!Number.isInteger(id) || !termsFor(plan, degree).includes(term)) return redirect("/", 303);
  if (!movePlanCourse(plan.id, id, term)) {
    return redirect(`/?error=${encodeURIComponent(`That course is already planned in ${term}.`)}`, 303);
  }
  return redirect("/", 303);
};
