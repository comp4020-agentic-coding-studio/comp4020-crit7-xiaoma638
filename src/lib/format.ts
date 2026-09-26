import type { Result } from "./rules";

// What the student sees: four states, with a broken limit called out.
export type Tone = "met" | "missing" | "limit" | "over" | "manual";

export function tone(r: Result): Tone {
  if (r.status === "manual") return "manual";
  if (r.status === "within") return "limit";
  if (r.status === "met") return "met";
  return r.bound === "max" ? "over" : "missing";
}

export const toneLabel: Record<Tone, string> = {
  met: "Met",
  missing: "Missing",
  limit: "Limit",
  over: "Over limit",
  manual: "Check",
};

// Only completion requirements count toward "n of m met".
export type Category = "completion" | "limit" | "manual";

export function category(r: Result): Category {
  if (r.status === "manual") return "manual";
  if (r.kind === "constraint" && r.bound === "max") return "limit";
  return "completion";
}

export function progressText(r: Result): string {
  if (r.status === "choose") return "Choose one";
  if (r.status === "manual") return "Check yourself";
  if (r.measure === "courses") return `${r.done}/${r.required} courses`;
  if (r.measure === "parts") return `${r.done}/${r.required} parts`;
  if (r.bound === "max") {
    const over = r.done - r.required;
    return over > 0 ? `${r.done}/${r.required} max — ${over} over` : `${r.done} of max ${r.required} units`;
  }
  const short = r.required - r.done;
  return short > 0 ? `${r.done}/${r.required} units — ${short} missing` : `${r.done}/${r.required} units`;
}

export function percent(r: Result): number {
  if (r.status === "choose" || r.status === "manual" || r.required === 0) return 0;
  return Math.min(100, Math.round((r.done / r.required) * 100));
}

// The most specific two levels, e.g. "Artificial Intelligence › Advanced list".
export function shortPath(path: string[]): string {
  return path.slice(-2).join(" › ");
}
