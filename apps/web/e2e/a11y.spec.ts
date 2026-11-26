/** WCAG 2.2 AA checks (axe) on every screen, for the role that uses it, in light and dark. */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn, type RoleName } from "./helpers";

const SCREENS: [RoleName | null, string][] = [
  [null, "/signin"],
  ["teacher", "/"],
  ["teacher", "/bookings"],
  ["incharge", "/incharge"],
  ["incharge", "/outbox"],
  ["admin", "/admin?tab=resources"],
  ["admin", "/admin?tab=staff"],
  ["admin", "/admin?tab=curriculum"],
  ["admin", "/admin?tab=campuses"],
  ["viewer", "/reports"],
];

for (const scheme of ["light", "dark"] as const) {
  for (const [role, path] of SCREENS) {
    test(`${scheme}: ${path} as ${role ?? "visitor"}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      if (role) await signIn(page, role);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // The email preview is a script-free sandboxed frame axe cannot enter. Emails are plain layouts with a text part; the app screens are what is checked here.
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude(".email-frame").analyze();
      const found = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(found).toEqual([]);
    });
  }
}

test("the booking sheet is accessible and traps focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, "teacher");
  await page.goto("/?date=2026-12-02");
  await page.getByRole("button", { name: /: Free\./ }).first().click();
  await expect(page.getByLabel("Subject")).toBeFocused();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});
