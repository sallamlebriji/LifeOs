import { expect, test } from '@playwright/test';

test('sign up, land on My Day, add and complete a task, sign out', async ({ page }) => {
  const email = `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.test`;

  await page.goto('/today');
  await expect(page).toHaveURL(/\/login/);

  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('What should we call you?').fill('Playwright');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('playwright-pass-42');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Playwright');
  await expect(page.getByText('No tasks for today')).toBeVisible();

  await page.getByLabel('Add task').fill('Write the release notes');
  await page.getByRole('button', { name: 'Add task' }).click();
  const box = page.getByRole('checkbox', { name: /Write the release notes/ });
  await expect(box).toBeVisible();
  await box.click();
  await expect(page.getByText('1 of 1 done')).toBeVisible();

  await page.getByRole('button', { name: /Account:/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
});
