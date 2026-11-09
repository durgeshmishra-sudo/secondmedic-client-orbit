// Local preview only. All API requests are intercepted with synthetic fixtures.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.CRM_TEST_ORIGIN || "http://localhost:5173";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error("Browser QA runs only against local preview.");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const output = process.env.CRM_SCREENSHOTS || ".sites-runtime/screenshots";
await mkdir(output, { recursive: true });
const views = ["Dashboard", "Clients", "Revenue", "Pipeline", "Calls", "Calendar", "Invoices", "Vendors", "Agreements", "Team", "Activity log"];
const member = { id: "qa-head", fullName: "QA Team Head", role: "head", teamName: "QA Team", isActive: true };
const fixture = { member, clients: [], revenue: [], pipeline: [], calls: [], meetings: [], invoices: [], payments: [], agreements: [], documents: [], vendors: [], members: [member, { ...member, id: "qa-staff-a", fullName: "QA Staff A", role: "staff" }, { ...member, id: "qa-staff-b", fullName: "QA Staff B", role: "staff" }], teamSummary: [], pipelineSettings: { probabilities: JSON.stringify({ l1: 20, l2: 50, l3: 100, l4: 100, l5: 100 }) } };
const month = new Date().toISOString().slice(0, 7);
fixture.clients.push({ id: "qa-client", clientCode: "QA-ONLY", legalName: "Example QA Client", ownerMemberId: member.id, teamName: member.teamName, segment: "Corporate", status: "l3", paymentTermsDays: 30, createdAt: "2026-01-01" });
fixture.pipeline.push({ id: "qa-project", clientId: "qa-client", ownerMemberId: member.id, stage: "l3", title: "Example QA Client", expectedRevenueMinor: 10000, expectedMarginMinor: 1500, expectedCloseDate: `${month}-28`, revenueId: "qa-revenue", createdAt: "2026-01-01" });
fixture.revenue.push({ id: "qa-revenue", pipelineItemId: "qa-project", clientId: "qa-client", ownerMemberId: member.id, revenueMonth: month, entryDate: `${month}-01`, projectedRevenueMinor: 10000, actualRevenueMinor: 2500, projectedMarginMinor: 1500, revenueMinor: 10000, marginMinor: 1500 });
fixture.invoices.push({ id: "qa-invoice", clientId: "qa-client", invoiceNumber: "QA-ONLY-1", issueDate: `${month}-01`, dueDate: `${month}-28`, totalMinor: 10000, status: "sent", createdByMemberId: member.id });
fixture.vendors.push({ id: "qa-vendor", vendorName: "QA Vendor", clientId: "qa-client", clientIds: '["qa-client"]', ownerMemberId: member.id, staffMemberId: member.id, amountMinor: 1000, dueDate: `${month}-28`, paymentStatus: "unpaid", vendorPaymentStatus: "unpaid" });
const errors = [], results = [];
let postCount = 0, uploadCount = 0, failUpload = true;
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/crm", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: fixture });
      postCount++;
      await new Promise(resolve => setTimeout(resolve, 700));
      return route.fulfill({ json: { ok: true, id: "qa-synthetic-record" } });
    });
    await page.route("**/api/upload", async route => { uploadCount++; return route.fulfill({ status: failUpload ? 503 : 201, json: failUpload ? { error: "Synthetic upload failure" } : { ok: true, document: { id: "qa-document" } } }); });
    await page.goto(origin);
    await page.getByRole("heading", { name: "Performance command center" }).waitFor();
    await page.locator(".last-updated").filter({ hasText: "Last updated" }).waitFor();
    for (const view of views) {
      if (width < 768) await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.locator(".crm-nav nav").getByRole("button", { name: view, exact: true }).click();
      if (width < 768) assert.equal(await page.getByRole("button", { name: "Menu", exact: true }).getAttribute("aria-expanded"), "false", "Navigation closes the drawer");
      await page.locator(".topbar h1").filter({ hasText: view === "Dashboard" ? "Performance command center" : view }).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `${view} overflows at ${width}px`);
      await page.screenshot({ path: `${output}/${view.toLowerCase()}-${width}.png`, fullPage: true });
      results.push(`${view} ${width}px: visible, no horizontal page overflow`);
    }
    if (width === 1440) {
      await page.locator(".crm-nav nav").getByRole("button", { name: "Clients", exact: true }).click();
      await page.getByRole("button", { name: /Add client/ }).click();
      await page.getByRole("heading", { name: "Add a client" }).waitFor();
      assert.equal(await page.locator('select[name="ownerMemberId"] option').count(), 4, "Head can choose self and two team members");
      await page.getByLabel("Client name", { exact: false }).fill("QA Synthetic Client");
      await page.locator('select[name="ownerMemberId"]').selectOption("qa-staff-a");
      await page.locator('select[name="segment"]').selectOption("Corporate");
      await page.locator('select[name="leadSource"]').selectOption("Referral");
      await page.locator('input[name="projectedRevenue"]').fill("100");
      const before = postCount;
      await page.getByRole("button", { name: "Save client", exact: true }).click();
      assert.equal(await page.locator('button[type="submit"]').isDisabled(), true, "Save disabled in flight");
      await page.waitForTimeout(850);
      assert.equal(postCount - before, 1, "One click produces one write");
      await page.locator(".record-modal").waitFor({ state: "hidden" });
      await page.locator(".crm-nav nav").getByRole("button", { name: "Agreements", exact: true }).click();
      await page.getByRole("button", { name: /Add agreement|Upload agreement/ }).click();
      assert.equal(await page.locator('input[type="file"][name="file"]').count(), 1, "Agreement upload picker visible for head");
      await page.locator('input[name="title"]').fill("QA upload test");
      await page.locator('select[name="clientId"]').selectOption("qa-client");
      await page.locator('input[name="file"]').setInputFiles({ name: "qa-document.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% synthetic fixture only") });
      const recordWrites = postCount;
      await page.getByRole("button", { name: "Save agreement", exact: true }).click();
      await page.getByText(/Record saved. File upload needs attention/).waitFor();
      assert.equal(postCount - recordWrites, 1, "Record saved once before upload failure");
      assert.equal(await page.locator(".record-modal").isVisible(), true, "Upload failure keeps the form open");
      failUpload = false;
      await page.getByRole("button", { name: "Retry save", exact: true }).click();
      await page.locator(".record-modal").waitFor({ state: "hidden" });
      assert.equal(postCount - recordWrites, 1, "Retry uploads only the file without another record");
      assert.equal(uploadCount, 2);
      results.push("Add client, team owners, disabled Save, agreement upload error and file-only retry pass");
    }
    await page.close();
  }
  const slowPage = await browser.newPage({ viewport: { width: 390, height: 800 } });
  slowPage.setDefaultTimeout(20000);
  let recovered = false;
  await slowPage.route("**/api/crm", async route => {
    if (recovered) return route.fulfill({ json: fixture });
    await new Promise(resolve => setTimeout(resolve, 16000));
    await route.fulfill({ json: fixture }).catch(() => undefined);
  });
  await slowPage.goto(origin);
  await slowPage.getByText(/Taking longer than usual/).waitFor();
  await slowPage.getByText("Could not load data", { exact: true }).waitFor();
  assert.equal(await slowPage.locator(".brand-loader").count(), 0, "Timed-out loading stops the skeleton");
  recovered = true;
  await slowPage.getByRole("button", { name: "Retry", exact: true }).click();
  await slowPage.locator(".last-updated").filter({ hasText: "Last updated" }).waitFor();
  results.push("10-second slow notice, 15-second error, stopped loader and Retry recovery pass");
  await slowPage.close();
  assert.deepEqual(errors, [], "No browser console exceptions");
  console.log(JSON.stringify({ passed: results, errors, postCount, uploadCount }, null, 2));
} finally { await browser.close(); }
