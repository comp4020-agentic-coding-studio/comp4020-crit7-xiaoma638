import type { Result } from "./rules";

export function progressText(r: Result): string {
  switch (r.status) {
    case "choose":
      return "Choose one";
    case "manual":
      return "Check yourself";
  }
  if (r.measure === "courses") return `${r.done}/${r.required} courses`;
  if (r.measure === "parts") return `${r.done}/${r.required} parts met`;
  if (r.bound === "max") {
    const over = r.done - r.required;
    return over > 0 ? `${r.done} units — ${over} over the ${r.required}-unit limit` : `${r.done} of at most ${r.required} units`;
  }
  const short = r.required - r.done;
  return short > 0 ? `${r.done}/${r.required} units — ${short} missing` : `${r.done}/${r.required} units`;
}

export function percent(r: Result): number {
  if (r.status === "choose" || r.status === "manual" || r.required === 0) return 0;  return Math.min(100, Math.round((r.done / r.required) * 100));
}

export const statusLabel: Record<Result["status"], string> = {
  met: "Met",
  unmet: "Not yet",
  choose: "Choose",
  manual: "Check",
  within: "Limit",
};
