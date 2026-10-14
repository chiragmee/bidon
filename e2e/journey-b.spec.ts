import { expect, PNG, signIn, switchTo, test } from './fixtures';

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

test('journey B 1–9: seller creates, validates, previews and publishes an assured lot', async ({ page }) => {
  test.setTimeout(60_000); // the longest journey: four wizard steps and seven uploads
  // 1–2. Enter Seller demo mode and open the dashboard.
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore as Seller' }).click();
  await expect(page).toHaveURL(/\/seller\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Seller dashboard' })).toBeVisible();

  // 3. Create a new lot — step 1 validates inline and keeps the profile's yard.
  await page.getByRole('link', { name: 'Create a new lot' }).click();
  await expect(page.getByRole('heading', { name: 'Basic details' })).toBeVisible();
  await expect(page.getByLabel(/Yard or plant/)).toHaveValue('Raipur Yard #4, Urla Industrial Area');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/Enter a lot title buyers will recognise/)).toBeVisible();

  // 4. Category, grade, quantity, condition and location.
  await page.getByLabel(/Lot title/).fill('HMS 1 & 2 steel scrap, shed demolition');
  await page.getByLabel(/^Category/).selectOption('ferrous_hms');
  await page.getByLabel(/Material type or grade/).fill('HMS 1 & 2 (80:20)');
  await page.getByLabel(/Description/).fill('Structural steel from a dismantled shed, cut to furnace size.');
  await page.getByLabel(/^State/).selectOption('Chhattisgarh');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Quantity and condition' })).toBeVisible();
  await expect(page).toHaveURL(/\/seller\/lots\/LOT-2000\/edit$/); // draft autosaved
  await page.getByLabel(/Estimated quantity/).fill('25');
  await page.getByLabel(/Contamination estimate/).fill('3');
  await page.getByLabel(/Material form and sizing/).fill('Cut sections up to 1.5 m');
  await page.getByLabel(/Typical thickness/).fill('Above 6 mm');
  await page.getByRole('button', { name: 'Continue' }).click();

  // 5. Evidence: the pilot checklist counts toward Lot Assurance.
  await expect(page.getByRole('heading', { name: 'Evidence' })).toBeVisible();
  const files = Array.from({ length: 6 }, (_, i) => ({ ...PNG, name: `yard-${i + 1}.png` }));
  const group = page.getByRole('group', { name: 'Photos, video and documents' });
  await group.getByLabel('Choose files').setInputFiles([...files, { name: 'walkthrough.mp4', mimeType: 'video/mp4', buffer: Buffer.from('demo') }]);
  await expect(group.getByText('7 files attached')).toBeVisible();
  await expect(page.getByText('Yard photos: 6 of 6')).toBeVisible();
  await expect(page.getByText('Walkthrough video: 1 of 1')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 6. Reserve, EMD and auction dates — an invalid range is blocked.
  await expect(page.getByRole('heading', { name: 'Auction and assurance' })).toBeVisible();
  await page.getByLabel(/Reserve price per MT/).fill('31000');
  await page.getByRole('button', { name: /Use suggested EMD ₹60,000/ }).click();
  const opens = new Date(Date.now() + 2 * 3_600_000);
  await page.getByLabel(/Bidding opens/).fill(local(opens));
  await page.getByLabel(/Bidding closes/).fill(local(new Date(opens.getTime() - 3_600_000)));

  // 7. Review the assurance policy for the category.
  await page.getByLabel('Offer this lot with Lot Assurance').check();
  await expect(page.getByText('Up to 8.0% (you declared 3.0%)')).toBeVisible();
  await page.getByRole('button', { name: 'Preview listing' }).click();
  await expect(page.getByText('The closing time must be after the opening time.')).toBeVisible();
  await expect(page.getByText('Confirm you agree to the Lot Assurance terms to enable it.')).toBeVisible();
  await page.getByLabel(/Bidding closes/).fill(local(new Date(opens.getTime() + 26 * 3_600_000)));
  await page.getByLabel(/I agree: the declared grade/).check();
  await page.getByRole('button', { name: 'Preview listing' }).click();

  // 8. Preview as the buyer will see it, then publish.
  await expect(page).toHaveURL(/\/seller\/lots\/LOT-2000\/preview$/);
  await expect(page.getByText('Preview — this is how buyers will see your lot.')).toBeVisible();
  const la = page.getByRole('region', { name: 'Lot Assurance' });
  await expect(la.getByText('6 yard photos and 1 walkthrough video', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Publish auction' }).click();
  await page.getByRole('dialog', { name: 'Publish this auction?' }).getByRole('button', { name: 'Publish auction' }).click();
  await expect(page).toHaveURL(/\/seller\/lots\/LOT-2000\?published=1$/);
  await expect(page.getByText('Published', { exact: true })).toBeVisible();
  await expect(page.getByText('Upcoming').first()).toBeVisible();

  // 9. Back on the dashboard in the correct state; buyers see it as upcoming.
  await page.getByRole('link', { name: 'Dashboard' }).filter({ visible: true }).first().click();
  await page.getByRole('tab', { name: /Scheduled/ }).click();
  await expect(page.getByRole('tabpanel').getByText('HMS 1 & 2 steel scrap, shed demolition').filter({ visible: true }).first()).toBeVisible();

  await switchTo(page, 'buyer');
  await page.goto('/auctions?assured=1');
  await expect(page.getByRole('link', { name: /LOT-2000/ })).toBeVisible();
});

test('live lots explain why they can’t be edited; other sellers’ lots are off limits', async ({ page }) => {
  await signIn(page.context(), 'seller');
  await page.goto('/seller/lots/LOT-2025-0891');
  await expect(page.getByText('This auction is live, so it can’t be edited')).toBeVisible();
  await expect(page.getByText(/Bids and auction results cannot be changed by anyone/).first()).toBeVisible();
  await page.goto('/seller/lots/LOT-2025-0891/edit');
  await expect(page.getByRole('heading', { name: 'This lot can’t be edited now' })).toBeVisible();
  await page.goto('/seller/lots/LOT-2025-0899');
  await expect(page.getByRole('heading', { name: 'Lot not available' })).toBeVisible();
});

test('a draft keeps its values across reloads', async ({ page }) => {
  await signIn(page.context(), 'seller');
  await page.goto('/seller/lots/LOT-2025-0920/edit?step=2');
  await page.getByLabel(/Typical thickness/).fill('8–20 mm');
  await expect(page.getByText(/Draft saved/)).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel(/Typical thickness/)).toHaveValue('8–20 mm');
  await page.goto('/seller/lots/LOT-2025-0920/preview');
  await expect(page.getByRole('button', { name: 'Publish auction' })).toBeDisabled();
  await expect(page.getByText(/to fix before publishing/)).toBeVisible();
});

test('seller onboarding: validation and a demo-approved profile', async ({ page }) => {
  await page.goto('/onboarding/seller');
  await page.getByRole('button', { name: 'Create seller account' }).click();
  await expect(page.getByText('Enter your company name.')).toBeVisible();
  await page.getByLabel(/Your name/).fill('Kavita Rao');
  await page.getByLabel(/Company name/).fill('Rao Metal Works');
  await page.getByLabel(/Business type/).selectOption('Fabricator');
  await page.getByLabel(/Yard or operating location/).fill('Plot 12, MIDC Hingna');
  await page.getByLabel(/^City/).fill('Nagpur');
  await page.getByLabel(/^State/).selectOption('Maharashtra');
  await page.getByRole('button', { name: 'Ferrous / HMS' }).click();
  await page.getByLabel(/Work email/).fill('kavita@raometal.example');
  await page.getByLabel(/Mobile number/).fill('123');
  await page.getByRole('button', { name: 'Create seller account' }).click();
  await expect(page.getByText(/Enter a 10-digit mobile number/)).toBeVisible();
  await page.getByLabel(/Mobile number/).fill('98765 43210');
  await page.getByRole('button', { name: 'Create seller account' }).click();
  await expect(page).toHaveURL(/\/seller\/dashboard\?welcome=1$/);
  await expect(page.getByText('Your seller profile is ready (demo-approved)')).toBeVisible();
  await expect(page.getByText('New seller')).toBeVisible();
  await page.getByRole('link', { name: 'Create a new lot' }).first().click();
  await expect(page.getByLabel(/Yard or plant/)).toHaveValue('Plot 12, MIDC Hingna');
});
