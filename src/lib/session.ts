import type { AstroCookies } from "astro";
import { getPlan, type Plan } from "./db";

const COOKIE = "plan";

export function currentPlan(cookies: AstroCookies): Plan | undefined {
  return getPlan(cookies.get(COOKIE)?.value);
}

export function rememberPlan(cookies: AstroCookies, id: string) {
  cookies.set(COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 400,
  });
}
