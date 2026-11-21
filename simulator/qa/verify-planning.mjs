import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.env.QA_ATLAS_URL ?? "http://127.0.0.1:5173/";
const output =
  process.env.QA_OUTPUT_DIR ?? join(tmpdir(), "earthlab-planning-review");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.QA_CHROME_PATH,
  headless: true,
  args:
    process.env.QA_SOFTWARE_GL === "1"
      ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
      : [],
});

try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      hasTouch: mobile,
      isMobile: mobile,
      reducedMotion: "reduce",
    });
    const press = (locator) => (mobile ? locator.tap() : locator.click());
    const btn = (name) => page.getByRole("button", { name, exact: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.locator(".atlas-map").waitFor();
    await press(btn("Open study menu"));
    await press(btn("Resource planning"));
    await page
      .getByRole("heading", { name: "Preserve service access" })
      .waitFor();
    assert.match(
      await page.locator(".plan-context").innerText(),
      /Illustrative Houston network/,
    );
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/allocation/plans/compare") && r.ok(),
    );
    await press(btn("Response"));
    const { data } = await (await response).json();
    assert.equal(data.phase, "response");
    assert.equal(data.strategies.length, 3);
    await page
      .getByRole("heading", { name: "Restore service access" })
      .waitFor();
    const row = page
      .locator(".plan-matrix")
      .first()
      .getByRole("row")
      .filter({ has: btn("Nash bargaining") });
    assert.ok(
      (await row.innerText()).includes(
        data.strategies
          .find((s) => s.id === "bargaining")
          .utilities.health.toFixed(2),
      ),
    );
    await page.screenshot({
      path: join(
        output,
        mobile ? "planning-mobile.jpg" : "planning-desktop.jpg",
      ),
      type: "jpeg",
      quality: 82,
    });
    await press(btn("Inspect plan on map"));
    await press(btn("Before"));
    assert.equal(
      await page.locator(".plan-playback output").innerText(),
      "0 h",
    );
    await press(btn("Play selected plan"));
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector(".plan-playback output")
            ?.textContent?.split(" ")[0],
        ) > 0,
    );
    await press(btn("After"));
    await page.screenshot({
      path: join(
        output,
        mobile ? "planning-map-mobile.jpg" : "planning-map-desktop.jpg",
      ),
      type: "jpeg",
      quality: 82,
    });
    await press(btn("Map view options"));
    await press(btn("2D map"));
    const link = page
      .locator(".atlas-flat-map")
      .getByRole("button", { name: /main link.*modeled action complete/i });
    await link.waitFor();
    const line = link.locator("polyline").first();
    const point = await line.evaluate(async (e) => {
      const midpoint = () =>
        e
          .getPointAtLength(e.getTotalLength() / 2)
          .matrixTransform(e.getScreenCTM());
      const role = e.closest('[role="button"]');
      let p = midpoint();
      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        const next = midpoint();
        if (
          Math.hypot(next.x - p.x, next.y - p.y) < 0.05 &&
          role.contains(document.elementFromPoint(next.x, next.y))
        )
          return { x: next.x, y: next.y };
        p = next;
      }
      throw new Error(
        "The recommended link did not settle at a visible touch target.",
      );
    });
    if (mobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    const inspector = page.getByRole("region", {
      name: "Planning asset details",
    });
    await inspector.waitFor();
    assert.match(await inspector.innerText(), /action removed/);
    await press(page.getByText("Resources & assumptions", { exact: true }));
    await page
      .getByRole("spinbutton", { name: "Budget units", exact: true })
      .fill("0");
    const zeroRequest = page.waitForResponse(
      (r) => r.ok() && r.url().endsWith("/allocation/plans/compare"),
    );
    await press(btn("Compare strategies"));
    const zero = (await (await zeroRequest).json()).data;
    assert.equal(zero.agreement, false);
    assert.ok(zero.strategies.every((s) => s.interventions.length === 0));
    await page
      .getByRole("heading", { name: "No mutually beneficial agreement" })
      .waitFor();
    await page.route("**/api/v1/allocation/**", (route) => route.abort());
    await press(btn("Mitigation"));
    await page.waitForFunction(() =>
      document
        .querySelector(".plan-context")
        ?.textContent.includes("Offline example"),
    );
    assert.match(await page.locator(".plan-run").innerText(), /Edits pending/);
    assert.deepEqual(errors, []);
    console.log(
      (mobile ? "390px emulated touch" : "1440px desktop") +
        " passed live optimization, playback, geographic pick, zero-resource outcome and disconnected fixture",
    );
    await page.close();
  }
} finally {
  await browser.close();
}
