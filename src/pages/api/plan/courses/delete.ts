import type { APIRoute } from "astro";
import { removePlanCourse } from "../../../../lib/db";
import { currentPlan } from "../../../../lib/session";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const plan = currentPlan(cookies);
  if (!plan) return redirect("/", 303);
  const id = Number((await request.formData()).get("id"));
  if (Number.isInteger(id)) removePlanCourse(plan.id, id);
  return redirect("/", 303);
};
