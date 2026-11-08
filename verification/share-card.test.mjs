import test from "node:test";
import assert from "node:assert/strict";
import { makeShareCard } from "./share-card.mjs";

test("share card draws demo details and wraps long verification URLs", async () => {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const text = [];
  const context = {
    fillRect() {}, strokeRect() {}, drawImage() {},
    measureText(value) { return { width: value.length * 10 }; },
    fillText(value, x, y) { text.push({ value, x, y }); },
  };
  const canvas = {
    getContext() { return context; },
    toBlob(callback, type) { callback(new Blob(["image"], { type })); },
  };
  globalThis.document = { createElement: () => canvas };
  globalThis.Image = class { async decode() {} };
  try {
    const url = `https://example.com/verify/${"a".repeat(32)}`;
    const blob = await makeShareCard({
      student: "Priya Sharma", title: "Help neighbours connect online",
      issuer: "Community Centre (fictional demo)", issuedAt: "2026-11-07",
    }, url, "/qr.png");
    assert.equal(blob.type, "image/png");
    assert.equal(canvas.width, 1080);
    assert.equal(canvas.height, 1080);
    assert.ok(text.some(({ value }) => value.includes("FICTIONAL DEMO")));
    assert.ok(text.some(({ value }) => value.includes("Not a real award")));
    assert.equal(text.filter(({ y }) => y === 895 || y === 921).map(({ value }) => value).join(""), url);
  } finally {
    globalThis.document = previousDocument;
    globalThis.Image = previousImage;
  }
});
