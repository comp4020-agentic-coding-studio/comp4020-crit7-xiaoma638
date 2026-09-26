import type { APIRoute } from "astro";
import { getDegree, savePlan } from "../../lib/db";
import { rememberPlan } from "../../lib/session";

// Plans start in the year the rules are from: checking a 2021 plan against
// 2027 rules would give confident wrong answers.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const degree = getDegree(String((await request.formData()).get("degree") ?? ""));
  if (!degree) return redirect("/", 303);
  rememberPlan(cookies, savePlan(cookies.get("plan")?.value, degree.code, degree.year));
  return redirect("/plan", 303);
};
