import { expect, test, type Page } from "@playwright/test";

/** Parses an Atom document in the browser and checks what RFC 4287 requires of a feed and its entries. */
async function checkAtom(page: Page, path: string) {
  const res = await page.request.get(path);
  expect(res.status(), path).toBe(200);
  expect(res.headers()["content-type"], path).toContain("application/atom+xml");
  const body = await res.text();
  await page.goto("/");
  const report = await page.evaluate((xml) => {
    const ns = "http://www.w3.org/2005/Atom";
    const docXml = new DOMParser().parseFromString(xml, "application/xml");
    if (docXml.getElementsByTagName("parsererror").length > 0) return { error: "not well-formed" };
    const feed = docXml.documentElement;
    const child = (el: Element, name: string) => Array.from(el.children).filter((c) => c.namespaceURI === ns && c.localName === name);
    const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    const problems: string[] = [];
    if (feed.namespaceURI !== ns || feed.localName !== "feed") problems.push("root is not atom:feed");
    for (const name of ["id", "title", "updated"]) if (child(feed, name).length !== 1) problems.push(`feed needs one ${name}`);
    if (!rfc3339.test(child(feed, "updated")[0]?.textContent ?? "")) problems.push("feed updated is not RFC 3339");
    if (child(feed, "author").length === 0) problems.push("feed has no author");
    if (!child(feed, "link").some((l) => l.getAttribute("rel") === "self")) problems.push("feed has no self link");
    const entries = child(feed, "entry");
    const ids = new Set<string>();
    for (const e of entries) {
      for (const name of ["id", "title", "updated"]) if (child(e, name).length !== 1) problems.push(`entry needs one ${name}`);
      if (!rfc3339.test(child(e, "updated")[0]?.textContent ?? "")) problems.push("entry updated is not RFC 3339");
      if (!child(e, "link").some((l) => (l.getAttribute("rel") ?? "alternate") === "alternate")) problems.push("entry has no alternate link");
      ids.add(child(e, "id")[0]?.textContent ?? "");
    }
    if (ids.size !== entries.length) problems.push("entry ids repeat");
    return { problems, entries: entries.length };
  }, body);
  expect(report, path).not.toHaveProperty("error");
  expect(report.problems, path).toEqual([]);
  expect(report.entries).toBeLessThanOrEqual(50);
  return report.entries as number;
}

test("the Andalucía, municipality and Natura 2000 feeds are valid Atom", async ({ page }) => {
  expect(await checkAtom(page, "/feeds/andalucia.xml")).toBe(50);
  expect(await checkAtom(page, "/feeds/municipio/11021.xml")).toBeGreaterThan(0);
  await checkAtom(page, "/feeds/natura/ES0000049.xml");
});

test("a municipality page links its feed in the head and in the page", async ({ page }) => {
  await page.goto("/municipio/11021");
  await expect(page.locator('head link[rel="alternate"][type="application/atom+xml"]')).toHaveAttribute("href", /\/feeds\/municipio\/11021\.xml$/);
  await expect(page.getByRole("link", { name: "Seguir este municipio (RSS)" })).toHaveAttribute("href", "/feeds/municipio/11021.xml");
});
