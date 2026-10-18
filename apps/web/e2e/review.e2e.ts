import { expect, test } from "@playwright/test";

test("review page follows a real decision path to its source comment", async ({
  page,
}) => {
  await page.goto("/repos/vitejs/vite/pr/23333");
  await expect(
    page.getByRole("heading", { name: "Dev server integration" }),
  ).toBeVisible();
  await expect(page.getByText("high risk", { exact: true })).toBeVisible();
  await expect(page.getByText("Complete", { exact: true })).toBeVisible();
  await expect(page.getByText("Follow the source")).toBeVisible();
  await expect(page.locator(".source-content p")).toContainText(
    "currently exposes the `DevTools()` plugin",
  );
  await expect(
    page.getByRole("link", { name: "Open on GitHub" }),
  ).toHaveAttribute(
    "href",
    /github\.com\/vitejs\/vite\/pull\/23333#discussion_r\d+/,
  );

  await page.getByRole("button", { name: "Play path" }).click();
  await expect(page.getByRole("button", { name: "Pause path" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play path" })).toBeVisible({
    timeout: 5_000,
  });

  await page.goto(
    "/repos/vitejs/vite/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig",
  );
  await expect(
    page.getByRole("heading", { name: "Ask the codebase." }),
  ).toBeVisible();
  await expect(page.getByLabel("FUNCTION ID")).toHaveValue(
    "fn:packages/vite/src/node/config.ts#resolveConfig",
  );
  await expect(
    page.getByRole("button", { name: "Ask Provenance" }),
  ).toBeVisible();
});
