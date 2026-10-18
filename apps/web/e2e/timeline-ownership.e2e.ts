import { expect, test } from "@playwright/test";

test("repository ownership page renders bus factor metrics and methodology", async ({
  page,
}) => {
  await page.goto("/repos/vitejs/vite");
  await expect(page.getByText("AVERAGE BUS FACTOR")).toBeVisible();
  await expect(page.getByText("HIGH RISK MODULES")).toBeVisible();
  await expect(page.getByText("COMMITS ANALYZED")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Calculation Standard & Ownership Concentration",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Bus factor is an empirical estimate of historical commit"),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Filter modules by path…")).toBeVisible();
});

test("history time slider page scrubs cutoff and refreshes as-of subgraph", async ({
  page,
}) => {
  await page.goto("/repos/vitejs/vite/time");
  await expect(page.getByText("HISTORICAL CUTOFF")).toBeVisible();
  const slider = page.getByRole("slider", {
    name: "Repository timeline cutoff",
  });
  await expect(slider).toBeVisible();

  await expect(page.getByText("AS-OF NODES")).toBeVisible();
  await expect(page.getByText("AS-OF EDGES")).toBeVisible();
  await expect(page.getByText("KNOWN DECISIONS")).toBeVisible();

  await expect(page.getByRole("button", { name: /DECISIONS/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /NODES/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /EDGES/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /GRAPH/ })).toBeVisible();

  await page.getByRole("button", { name: "Midpoint" }).click();
  await expect(slider).toBeVisible();
  await expect(page.getByText("HISTORICAL CUTOFF")).toBeVisible();
});
