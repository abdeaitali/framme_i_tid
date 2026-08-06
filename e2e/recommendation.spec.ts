import { expect, test } from "@playwright/test";

test("searches for a reliable departure and saves the commute", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Från").selectOption({ label: "Linköping C" });
  await page.getByLabel("Till").selectOption({ label: "Stockholm Central" });
  await page.getByLabel("Måste vara framme").fill("08:30");
  await page.getByRole("button", { name: "Hitta säkraste avgången" }).click();

  await expect(page).toHaveURL(/\/resultat\?/);
  const recommendation = page.getByRole("region", { name: "Rekommenderad avgång" });
  await expect(recommendation).toBeVisible();
  await expect(recommendation.getByText(/chans att hinna/i)).toBeVisible();
  await expect(recommendation.getByText(/jämförbara resor anlände före/i)).toBeVisible();

  await page.getByRole("button", { name: "Spara som återkommande resa" }).click();
  await expect(page).toHaveURL(/\/pendling\?saved=1/);
  await expect(page.getByRole("heading", { name: "Veckan i ett ögonkast" })).toBeVisible();
  await expect(page.getByText("Pendlingen är sparad på den här enheten.")).toBeVisible();
});
