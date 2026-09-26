import type { ContextKey } from "@/lib/catalog/context";
import { contextKeys } from "@/lib/catalog/context";
import type { Doc } from "@/lib/db/types";
import { emptyProfileDocs } from "@/lib/docs/profile";

/** Profile docs where the given context is known: inferred from their site, or (`confirmedProfile`) told by them. */
export const profileWith = (...known: ContextKey[]) => profile(known, "inferred");
export const confirmedProfile = (...known: ContextKey[]) => profile(known, "confirmed");

function profile(known: ContextKey[], status: "inferred" | "confirmed") {
  return emptyProfileDocs().map((d) => ({
    ...d,
    sections: Object.fromEntries(
      Object.entries(d.sections).map(([key, meta]) => [
        key,
        known.some((k) => contextKeys[k].doc === d.slug && contextKeys[k].section === key)
          ? { status, source: status === "confirmed" ? "user" : "website", updatedAt: null }
          : meta,
      ]),
    ),
  })) as unknown as Doc[];
}
