import test from "node:test";
import assert from "node:assert/strict";
import { distanceKm, formatDistance, hasCoordinates } from "./explore-map.mjs";

test("distances between Calgary venues are realistic", () => {
  const central = { lat: 51.0455213, lng: -114.0550679 }; // Central Library
  const fishCreek = { lat: 50.9518776, lng: -114.0609061 }; // Fish Creek Library
  const km = distanceKm(central, fishCreek);
  assert.ok(km > 10.3 && km < 10.6, String(km));
  assert.equal(distanceKm(central, central), 0);
});

test("distances read naturally", () => {
  assert.equal(formatDistance(0.02), "100 m");
  assert.equal(formatDistance(0.64), "600 m");
  assert.equal(formatDistance(2.345), "2.3 km");
  assert.equal(formatDistance(14.6), "15 km");
});

test("projects without valid coordinates are skipped", () => {
  assert.equal(hasCoordinates({ lat: 51, lng: -114 }), true);
  assert.equal(hasCoordinates({ lat: "51", lng: -114 }), false);
  assert.equal(hasCoordinates({ lat: 120, lng: -114 }), false);
  assert.equal(hasCoordinates({}), false);
});
