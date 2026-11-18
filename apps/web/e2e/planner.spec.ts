import { expect, test } from '@playwright/test';

test('create a task with an estimate, plan next week, apply, and see it on the calendar', async ({ page }) => {
  const email = `e2e.plan.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.test`;

  await page.goto('/register');
  await page.getByLabel('What should we call you?').fill('Planner E2E');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('playwright-pass-42');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/today/);

  // Tasks: create one with a 1-hour estimate.
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'New task' }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Title').fill('Prepare the quarterly review');
  await sheet.getByLabel('Estimate (min)').fill('60');
  await sheet.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('button', { name: /Prepare the quarterly review/ })).toBeVisible();

  // Planner: build a plan for next week, then apply it.
  await page.goto('/planner');
  await page.getByRole('radio', { name: 'Choose' }).click();
  await page.getByRole('button', { name: 'Next week' }).click();
  await page.getByRole('button', { name: 'Build plan' }).click();
  await expect(page.getByText('Proposed plan')).toBeVisible();
  await expect(page.getByText('Prepare the quarterly review').first()).toBeVisible();
  await page.getByRole('button', { name: /^Apply/ }).click();
  await expect(page.getByText('Applied', { exact: true })).toBeVisible();

  // Calendar (agenda covers the next 30 days) — the work block is in the week view of next week.
  await page.goto('/calendar');
  await page.getByRole('radio', { name: 'Week' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('note', { name: /Prepare the quarterly review/ })).toBeVisible();
});
