"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { trajectory } = require("../cursory");

const baseOptions = {
  seed: 12345,
  speed: {
    baseTimeMs: 240,
    flows: [new Array(10).fill(100)],
  },
  overshoot: {
    overshoots: 0,
  },
  noise: {
    noisinessDivider: 1_000_000_000,
  },
  deviation: {
    slopeDivider: 10,
  },
};

test("trajectory returns deterministic points with a seed", () => {
  const from = { x: 100, y: 100 };
  const to = { x: 220, y: 260 };

  const points = trajectory(from, to, baseOptions);

  assert.equal(points[0].x, 100);
  assert.equal(points[0].y, 100);
  assert.equal(points.at(-1).x, 220);
  assert.equal(points.at(-1).y, 260);
  assert.ok(points.length > 5, "expected multiple trajectory points");

  const firstFive = points.slice(0, 5);
  assert.deepEqual(firstFive, [
    { x: 100, y: 100 },
    { x: 102, y: 103 },
    { x: 104, y: 106 },
    { x: 106, y: 109 },
    { x: 108, y: 112 },
  ]);

  for (const point of points) {
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
  }
});

test("trajectory clamps points to the provided screen size", () => {
  const from = { x: 140, y: 140 };
  const to = { x: 400, y: 400 };
  const options = {
    ...baseOptions,
    screenSize: { width: 150, height: 150 },
  };

  const points = trajectory(from, to, options);

  for (const point of points) {
    assert.ok(point.x >= 0 && point.x <= 149);
    assert.ok(point.y >= 0 && point.y <= 149);
  }
});

test("trajectory validates inputs and surfaces configuration errors", () => {
  assert.throws(() => trajectory(null, { x: 1, y: 2 }, baseOptions), /from must be an object/);
  assert.throws(() => trajectory({ x: 1, y: 2 }, { x: "nope", y: 2 }, baseOptions), /must be finite numbers/);
  assert.throws(
    () =>
      trajectory({ x: 1, y: 2 }, { x: 3, y: 4 }, { ...baseOptions, noise: { noisinessDivider: 0 } }),
    /noise\.noisinessDivider must be a positive finite number/,
  );
});
