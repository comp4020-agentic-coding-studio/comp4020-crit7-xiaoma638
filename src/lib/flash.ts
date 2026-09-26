// What just happened, carried through the post/redirect as query parameters so
// the page can say so and offer to undo it.
export type Flash =
  | { done: "added"; code: string; term: string; id: number }
  | { done: "moved"; code: string; term: string; from: string; id: number }
  | { done: "removed"; code: string; term: string; units: number }
  | { done: "undone" };

export function flashUrl(flash: Flash): string {
  const params = new URLSearchParams(Object.entries(flash).map(([k, v]) => [k, String(v)]));
  return `/?${params}`;
}

export function readFlash(params: URLSearchParams): Flash | undefined {
  const code = params.get("code") ?? "";
  const term = params.get("term") ?? "";
  const id = Number(params.get("id"));
  switch (params.get("done")) {
    case "added":
      return { done: "added", code, term, id };
    case "moved":
      return { done: "moved", code, term, from: params.get("from") ?? "", id };
    case "removed":
      return { done: "removed", code, term, units: Number(params.get("units")) };
    case "undone":
      return { done: "undone" };
  }
}
