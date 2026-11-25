/** The main journeys, one per role. */
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("teacher books a free lab slot, sees it in My bookings, and cancels it", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/?date=2026-12-02");
  const free = page.getByRole("button", { name: /Quantum.*: Free\./ }).first();
  await free.click();
  await page.getByLabel("Subject").selectOption({ index: 1 });
  await page.getByLabel("Year").selectOption({ index: 1 });
  await page.getByLabel("Students").fill("20");
  await page.getByRole("button", { name: /^Book Quantum/ }).click();
  await expect(page.getByText("Confirmed. A confirmation email")).toBeVisible();

  await page.goto("/bookings");
  const row = page.locator("li", { hasText: "Quantum" }).filter({ hasText: "Confirmed" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Cancel", exact: true }).click();
  await row.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByText(/Cancelled/).first()).toBeVisible();
});

test("in-charge sees the calendar and today's sessions", async ({ page }) => {
  await signIn(page, "incharge");
  await page.goto("/incharge");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("Something went wrong");
});

test("admin opens every admin tab", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin");
  const tabs = await page.locator("a[href^='/admin?tab=']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
  expect(tabs.length).toBeGreaterThan(5);
  for (const href of tabs) {
    const r = await page.goto(href);
    expect(r?.status(), href).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
  }
});

test("leadership sees reports and can export CSV", async ({ page }) => {
  await signIn(page, "viewer");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const csv = await page.request.get("/api/v1/reports/export?table=curriculum");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Code,Strand");
});

test("the API description is published", async ({ request }) => {
  const r = await request.get("/api/v1/openapi.json");
  expect(r.status()).toBe(200);
  expect((await r.json()).openapi).toBe("3.1.0");
});
