import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/admin", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("admin bundle never redirects to the legacy xxx route", async () => {
  const adminBundle = await readFile(
    new URL("../public/assets/AdminDashboard-COd7Vnns.js", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(adminBundle, /\/xxx(?:\/login)?/);
});

test("admin card-data button recognizes the current order fields", async () => {
  const enhancements = await readFile(
    new URL("../public/admin-enhancements.js", import.meta.url),
    "utf8",
  );

  assert.match(enhancements, /order\?\.valor/);
  assert.match(enhancements, /card_encriptado/);
  assert.match(enhancements, /"Ver dados"/);
});
