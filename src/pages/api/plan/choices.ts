import type { APIRoute } from "astro";
import { setChoice } from "../../../lib/db";
import { currentPlan } from "../../../lib/session";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const plan = currentPlan(cookies);
  if (!plan) return redirect("/", 303);
  const form = await request.formData();
  const ok = setChoice(plan, String(form.get("choice") ?? ""), String(form.get("option") ?? ""));
  return redirect(ok ? "/" : `/?error=${encodeURIComponent("That option isn't part of this degree.")}`, 303);
};
