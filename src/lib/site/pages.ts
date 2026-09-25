// Which pages to read beyond the homepage: the ones that say what a business
// sells, to whom, and for how much. Ordered by how much they tell us.
const keyPages = [
  /pricing|plans/,
  /about|company|story|team/,
  /product|features|platform|how-it-works/,
  /services|solutions|what-we-do|offerings/,
  /customers|case-stud|testimonials|success|reviews/,
  /menu|shop|collections|tours|classes/,
];

const skip = /blog\/.+|news\/.+|careers|jobs|legal|privacy|terms|cookie|login|signin|signup|cart|checkout|\.(pdf|jpg|png|xml)$/;

export const pathOf = (url: string) => {
  const { pathname } = new URL(url);
  return pathname === "/" ? "/" : pathname.replace(/\/$/, "");
};

/** Up to `limit` same-site URLs, one per kind of key page, shortest (most top-level) path first. */
export function pickPages(homeUrl: string, links: string[], limit = 4): string[] {
  const home = new URL(homeUrl);
  const host = home.hostname.replace(/^www\./, "");
  const candidates = [...new Set(links)]
    .map((link) => {
      try {
        return new URL(link, home);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => !!u && u.hostname.replace(/^www\./, "") === host)
    .map((u) => ({ url: `${u.origin}${u.pathname}`.replace(/\/$/, ""), path: u.pathname.toLowerCase() }))
    .filter((c) => c.path !== "/" && c.path !== "" && !skip.test(c.path))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.length - b.path.length);

  const picked: string[] = [];
  for (const pattern of keyPages) {
    const match = candidates.find((c) => pattern.test(c.path) && !picked.includes(c.url));
    if (match) picked.push(match.url);
    if (picked.length === limit) break;
  }
  return picked;
}
