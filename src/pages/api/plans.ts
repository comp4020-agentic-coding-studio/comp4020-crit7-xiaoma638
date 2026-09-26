import type { APIRoute } from "astro";
import { getDegree, savePlan } from "../../lib/db";
import { rememberPlan } from "../../lib/session";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const degree = getDegree(String(form.get("degree") ?? ""));
  const startYear = Number(form.get("startYear"));
  if (!degree || !Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) {
    return redirect("/", 303);
  }
  rememberPlan(cookies, savePlan(cookies.get("plan")?.value, degree.code, startYear));
  return redirect("/plan", 303);
};
