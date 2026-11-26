/**
 * Screenshots for docs/guides and the walkthrough recording.
 *   GUIDE=1 RECORD=1 pnpm --filter web e2e guide
 * Skipped in normal runs.
 */
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const IMG = join(process.cwd(), "../../docs/guides/img");
test.skip(!process.env.GUIDE, "guide screenshots only when GUIDE=1");
test.use({ viewport: { width: 1280, height: 800 } });

test("teacher walkthrough", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/signin");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Sign in as Sara Khan/ }).click();
  await page.waitForURL("/");
  await page.goto("/?date=2026-12-02");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(IMG, "teacher-grid.png") });
  await page.getByRole("button", { name: /Quantum.*: Free\./ }).first().click();
  await page.waitForTimeout(800);
  await page.getByLabel("Subject").selectOption({ index: 1 });
  await page.getByLabel("Year").selectOption({ label: "Y8" });
  await page.waitForTimeout(400);
  await page.getByRole("checkbox", { name: /PR-8/ }).check().catch(() => undefined);
  await page.getByLabel("Students").fill("22");
  await page.getByLabel(/Lesson objective/).fill("Build and test a simple circuit");
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(IMG, "teacher-sheet.png") });
  await page.getByRole("button", { name: /^Book Quantum/ }).click();
  await expect(page.getByText("Confirmed. A Teams message")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.goto("/bookings");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(IMG, "teacher-bookings.png") });
});

test("in-charge, admin and reports screens", async ({ page }) => {
  await signIn(page, "incharge");
  await page.goto("/incharge");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(IMG, "incharge-schedule.png") });
  await signIn(page, "admin");
  for (const tab of ["resources", "staff", "curriculum", "campuses", "rules"]) {
    await page.goto(`/admin?tab=${tab}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(IMG, `admin-${tab}.png`), fullPage: tab === "resources" });
  }
  await signIn(page, "viewer");
  await page.goto("/reports");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(IMG, "reports.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page, "teacher");
  await page.goto("/?date=2026-12-02");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(IMG, "teacher-grid-dark.png") });
});
