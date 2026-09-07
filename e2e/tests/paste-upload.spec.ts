import { test, expect, Page } from "@playwright/test";
import { createTestProject, cleanupTestProjects } from "../helpers";
import { dialog } from "../helpers/ui";
import { Shell } from "../pages";

// A 1x1 PNG — the smallest thing the clipboard can hand us that the backend's
// allowed_extensions accepts.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * Fire the same `paste` event Chrome fires for Mod+V / Mod+Shift+V, with a
 * file on the clipboard. `selector` targets the element the paste lands on;
 * without it the event goes to the document, as it does when nothing is focused.
 */
async function pasteFile(
  page: Page,
  options: {
    fileName: string;
    base64: string;
    type: string;
    selector?: string;
  },
) {
  await page.evaluate(({ fileName, base64, type, selector }) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], fileName, { type }));
    const target = selector ? document.querySelector(selector) : document;
    target?.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, options);
}

test.describe("Paste to upload", () => {
  let projectName: string;

  test.beforeAll(async ({ request }) => {
    const project = await createTestProject(request, {
      project_name: `E2E Paste Project ${Date.now()}`,
    });
    projectName = project.name;
  });

  test.afterAll(async ({ request }) => {
    await cleanupTestProjects(request, "E2E Paste Project");
  });

  test("uploads a pasted image and copies its review link", async ({
    page,
    context,
  }) => {
    // Headless CI exposes no readable clipboard, so capture what the app writes.
    await page.addInitScript(() => {
      const store = window as unknown as { __lastCopy?: string };
      const record = (text: string) => {
        store.__lastCopy = text;
        return Promise.resolve();
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText = record;
      } else {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: record },
        });
      }
    });
    await new Shell(page).goto(`/vms/projects/${projectName}`);

    await pasteFile(page, {
      fileName: "image.png",
      base64: PNG_BASE64,
      type: "image/png",
    });

    // An image skips the dialog: the queue panel carries the progress.
    await expect(page.getByTestId("upload-queue-panel")).toBeVisible({
      timeout: 5000,
    });
    await expect(dialog(page, "Upload Assets")).not.toBeVisible();

    await expect(page.getByText("Review link copied to clipboard")).toBeVisible(
      { timeout: 30000 },
    );

    const copied = await page.evaluate(
      () => (window as unknown as { __lastCopy?: string }).__lastCopy ?? "",
    );
    expect(copied).toMatch(/\/vms\/review\/[^?]+\?token=\w+$/);

    // The link is public, so it opens without a session.
    const guest = await context.browser()!.newPage();
    const response = await guest.goto(copied);
    expect(response?.ok()).toBe(true);
    await guest.close();
  });

  test("names a pasted screenshot after the moment it was pasted", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await new Shell(page).goto(`/vms/projects/${projectName}`);

    await pasteFile(page, {
      fileName: "image.png",
      base64: PNG_BASE64,
      type: "image/png",
    });

    await expect(page.getByText(/pasted-\d{8}-\d{6}\.png/).first()).toBeVisible(
      { timeout: 30000 },
    );
  });

  test("explains itself when the format is not supported", async ({ page }) => {
    await new Shell(page).goto(`/vms/projects/${projectName}`);

    // BMP passes the client-side media check but is not in allowed_extensions.
    await pasteFile(page, {
      fileName: "unsupported.bmp",
      base64: btoa("not really a bitmap"),
      type: "image/bmp",
    });

    await expect(page.getByText(/BMP files are not supported/)).toBeVisible({
      timeout: 30000,
    });
  });

  test("opens the upload dialog for a pasted video", async ({ page }) => {
    await new Shell(page).goto(`/vms/projects/${projectName}`);

    const fileName = `pasted-${Date.now()}.mp4`;
    await pasteFile(page, {
      fileName,
      base64: btoa("not really a video"),
      type: "video/mp4",
    });

    const uploadDialog = dialog(page, "Upload Assets");
    await expect(uploadDialog).toBeVisible({ timeout: 5000 });
    await expect(uploadDialog.getByText(fileName)).toBeVisible();
  });

  test("leaves a paste inside a text field alone", async ({ page }) => {
    await new Shell(page).goto(`/vms/projects/${projectName}`);

    const search = page.getByPlaceholder("Search").first();
    await expect(search).toBeVisible({ timeout: 10000 });
    await search.click();

    await pasteFile(page, {
      fileName: "ignored.png",
      base64: PNG_BASE64,
      type: "image/png",
      selector: "input[placeholder='Search']",
    });

    await expect(dialog(page, "Upload Assets")).not.toBeVisible();
    await expect(page.getByTestId("upload-queue-panel")).not.toBeVisible();
  });
});
