"use strict";

/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} ScreenSize
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} FlowConfig
 * @property {number[]} characteristics
 */

/**
 * @typedef {Object} SpeedConfig
 * @property {number} baseTimeMs
 * @property {number[][]} flows
 */

/**
 * @typedef {Object} OvershootConfig
 * @property {number} overshoots
 * @property {number} minOvershootMovementMs
 * @property {number} minDistanceForOvershoots
 * @property {number} overshootRandomModifierDivider
 * @property {number} overshootSpeedupDivider
 */

/**
 * @typedef {Object} NoiseConfig
 * @property {number} noisinessDivider
 */

/**
 * @typedef {Object} DeviationConfig
 * @property {number} slopeDivider
 */

/**
 * @typedef {Object} TrajectoryOptions
 * @property {number} [seed] - Deterministic seed for randomness.
 * @property {(() => number)|{next: () => number}} [random] - Custom RNG or RNG-like object.
 * @property {ScreenSize} [screenSize] - Bounds used to clamp the generated points.
 * @property {number} [minSteps]
 * @property {number} [effectFadeSteps]
 * @property {number} [timeToStepsDivider]
 * @property {number} [reactionTimeBaseMs]
 * @property {number} [reactionTimeVariationMs]
 * @property {SpeedConfig} [speed]
 * @property {OvershootConfig} [overshoot]
 * @property {NoiseConfig} [noise]
 * @property {DeviationConfig} [deviation]
 */

/**
 * @typedef {Object} Movement
 * @property {number} destX
 * @property {number} destY
 * @property {number} distance
 * @property {number} xDistance
 * @property {number} yDistance
 * @property {number} timeMs
 * @property {Flow} flow
 */

/**
 * @typedef {Object} DoublePoint
 * @property {number} x
 * @property {number} y
 */

/**
 * Create a natural-looking trajectory between two points.
 *
 * @param {Point} from
 * @param {Point} to
 * @param {TrajectoryOptions} [options]
 * @returns {Point[]}
 */
function trajectory(from, to, options = {}) {
  const safeOptions = ensurePlainObject(options, "options");
  const bounds = normalizeScreenSize(safeOptions.screenSize);
  const start = clampPointToBounds(normalizePoint(from, "from"), bounds);
  const target = clampPointToBounds(normalizePoint(to, "to"), bounds);
  const config = normalizeOptions(safeOptions);
  const rng = createRng(safeOptions);

  if (start.x === target.x && start.y === target.y) {
    return [start];
  }

  const movements = createMovements(start, target, config, rng, bounds);
  /** @type {Point[]} */
  const points = [{ x: start.x, y: start.y }];
  let current = { x: start.x, y: start.y };

  for (const movement of movements) {
    const movementPoints = computeMovementPoints(current, movement, config, rng, bounds);
    points.push(...movementPoints);
    const lastPoint = points[points.length - 1];
    current = { x: lastPoint.x, y: lastPoint.y };
  }

  const finalPoint = points[points.length - 1];
  if (finalPoint.x !== target.x || finalPoint.y !== target.y) {
    points.push({ x: target.x, y: target.y });
  }

  return points;
}

/**
 * Ported flow templates from the original Java implementation.
 */
const flowTemplates = {
  variatingFlow() {
    return [
      10, 13, 14, 19, 16, 13, 15, 22, 56, 90, 97, 97, 66, 51, 50, 66, 91, 95, 87, 96, 98,
      88, 70, 62, 57, 63, 79, 93, 98, 97, 100, 104, 83, 49, 37, 53, 68, 73, 61, 51, 64, 107,
      103, 111, 94, 88, 95, 86, 88, 97, 108, 85, 86, 74, 72, 73, 58, 50, 50, 60, 62, 61, 52,
      53, 44, 30, 21, 25, 21, 17, 16, 13, 8, 2, 6, 9, 6, 3, 7, 12, 13, 15, 11, 9,
      9, 7, 6, 4, 1, 2, 3, 2, 2, 11, 15, 7, 1, 0, 0, 1,
    ];
  },
  interruptedFlow() {
    return [
      12, 11, 10, 20, 24, 19, 26, 15, 9, 9, 10, 24, 26, 30, 24, 49, 72, 60, 81, 113, 82,
      99, 67, 10, 7, 7, 7, 10, 8, 7, 9, 6, 6, 7, 10, 11, 12, 8, 7, 3, 0, 2,
      8, 10, 10, 12, 6, 4, 4, 3, 8, 11, 11, 11, 11, 13, 11, 20, 25, 18, 21, 23, 56,
      40, 36, 58, 69, 60, 63, 51, 87, 71, 86, 66, 115, 97, 80, 65, 50, 66, 57, 24, 11, 11,
      7, 3, 0, 0, 1, 3, 3, 5, 6, 12, 11, 7, 11, 17, 17, 23,
    ];
  },
  interruptedFlow2() {
    return [
      12, 11, 10, 20, 24, 19, 26, 15, 9, 9, 10, 24, 26, 30, 24, 49, 72, 60, 81, 113, 82,
      99, 67, 10, 12, 8, 11, 15, 16, 17, 17, 12, 16, 37, 10, 25, 12, 11, 41, 10, 12, 11,
      40, 36, 52, 61, 60, 64, 51, 82, 71, 81, 66, 105, 92, 59, 65, 51, 66, 54, 21, 21, 12,
      40, 36, 58, 69, 60, 63, 51, 87, 71, 86, 66, 115, 97, 80, 65, 50, 66, 57, 24, 11, 11,
      7, 3, 0, 0, 1, 3, 3, 5, 6, 12, 11, 7, 11, 17, 17, 23,
    ];
  },
  slowStartupFlow() {
    return [
      8, 5, 1, 1, 1, 2, 2, 3, 3, 3, 5, 7, 9, 10, 10, 11, 11, 11, 12, 12, 13,
      15, 14, 13, 15, 15, 17, 17, 18, 18, 20, 19, 20, 20, 19, 20, 19, 20, 21, 22, 20, 17,
      20, 22, 18, 20, 21, 18, 20, 20, 18, 20, 19, 21, 19, 19, 19, 19, 20, 19, 20, 21, 19,
      19, 17, 21, 21, 17, 19, 18, 20, 18, 19, 24, 34, 43, 35, 40, 41, 42, 42, 38, 40, 40,
      37, 36, 42, 40, 63, 85, 98, 92, 103, 102, 95, 86, 70, 52, 31, 19,
    ];
  },
  slowStartup2Flow() {
    return [
      7, 2, 1, 2, 2, 3, 5, 9, 10, 10, 11, 13, 13, 10, 4, 1, 1, 2, 3, 4, 6,
      9, 11, 11, 10, 14, 11, 9, 2, 1, 2, 2, 3, 4, 8, 9, 10, 11, 11, 13, 13, 15,
      14, 15, 18, 17, 19, 21, 20, 19, 18, 20, 20, 20, 20, 19, 20, 19, 19, 18, 20, 20, 19,
      20, 18, 20, 21, 19, 21, 18, 19, 25, 37, 37, 35, 41, 43, 41, 41, 40, 48, 81, 108, 91,
      88, 74, 46, 19, 46, 84, 35, 14, 19, 12, 13, 18, 38, 35, 11, 4,
    ];
  },
  jaggedFlow() {
    return [
      52, 106, 122, 8, 6, 117, 32, 2, 68, 34, 21, 81, 61, 86, 55, 4, 104, 21, 51, 8, 93,
      90, 43, 65, 82, 31, 40, 115, 107, 13, 35, 73, 81, 67, 31, 79, 57, 100, 55, 64, 13, 54,
      18, 68, 82, 61, 11, 84, 37, 20, 68, 33, 36, 55, 68, 75, 56, 20, 41, 120, 63, 72, 102,
      49, 4, 48, 69, 50, 35, 49, 54, 19, 95, 121, 26, 78, 31, 62, 53, 123, 73, 22, 39, 72,
      98, 33, 26, 5, 103, 23, 75, 35, 69, 33, 44, 12, 10, 101, 122, 19,
    ];
  },
  stoppingFlow() {
    return [
      8, 20, 39, 48, 66, 71, 79, 57, 29, 5, 2, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 6, 10, 12, 15, 19,
      37, 60, 100, 103, 98, 82, 87, 74, 65, 51, 57, 54, 61, 46, 38, 16,
    ];
  },
  adjustingFlow() {
    return [
      1, 1, 1, 3, 8, 7, 2, 2, 4, 8, 6, 3, 7, 13, 18, 19, 24, 35, 26, 14, 31,
      43, 49, 55, 61, 67, 61, 50, 43, 37, 30, 16, 5, 4, 4, 3, 3, 3, 4, 4, 3,
      2, 2, 3, 10, 14, 10, 7, 5, 5,
    ];
  },
  constantSpeed() {
    return new Array(10).fill(100);
  },
};

const DEFAULT_SPEED_CONFIG = Object.freeze({
  baseTimeMs: 500,
  flows: [
    flowTemplates.constantSpeed(),
    flowTemplates.variatingFlow(),
    flowTemplates.interruptedFlow(),
    flowTemplates.interruptedFlow2(),
    flowTemplates.slowStartupFlow(),
    flowTemplates.slowStartup2Flow(),
    flowTemplates.adjustingFlow(),
    flowTemplates.jaggedFlow(),
    flowTemplates.stoppingFlow(),
  ],
});

const DEFAULT_OVERSHOOT_CONFIG = Object.freeze({
  overshoots: 3,
  minOvershootMovementMs: 40,
  minDistanceForOvershoots: 10,
  overshootRandomModifierDivider: 20,
  overshootSpeedupDivider: 1.8,
});

const DEFAULT_NOISE_CONFIG = Object.freeze({
  noisinessDivider: 2,
});

const DEFAULT_DEVIATION_CONFIG = Object.freeze({
  slopeDivider: 10,
});

const DEFAULT_OPTIONS = Object.freeze({
  minSteps: 10,
  effectFadeSteps: 15,
  timeToStepsDivider: 8,
  reactionTimeBaseMs: 20,
  reactionTimeVariationMs: 120,
  speed: DEFAULT_SPEED_CONFIG,
  overshoot: DEFAULT_OVERSHOOT_CONFIG,
  noise: DEFAULT_NOISE_CONFIG,
  deviation: DEFAULT_DEVIATION_CONFIG,
});

/**
 * @param {Point} current
 * @param {Point} target
 * @param {Required<TrajectoryOptions>} config
 * @param {() => number} rng
 * @param {ScreenSize|null} bounds
 * @returns {Movement[]}
 */
function createMovements(current, target, config, rng, bounds) {
  const movements = [];
  let lastX = current.x;
  let lastY = current.y;
  let xDistance = target.x - lastX;
  let yDistance = target.y - lastY;

  const initialDistance = Math.hypot(xDistance, yDistance);
  const { flow: initialFlow, timeMs: initialTimeMs } = getFlowWithTime(
    initialDistance,
    config.speed,
    rng,
  );
  let mouseMovementMs = initialTimeMs;
  const overshoots = getOvershoots(initialDistance, config.overshoot);

  if (overshoots === 0) {
    movements.push(
      buildMovement(target.x, target.y, xDistance, yDistance, initialDistance, mouseMovementMs, initialFlow),
    );
    return movements;
  }

  for (let i = overshoots; i > 0; i -= 1) {
    const overshoot = getOvershootAmount(
      target.x - lastX,
      target.y - lastY,
      mouseMovementMs,
      i,
      config.overshoot,
      rng,
    );
    const destX = clampToScreen(target.x + overshoot.x, "width", bounds);
    const destY = clampToScreen(target.y + overshoot.y, "height", bounds);

    xDistance = destX - lastX;
    yDistance = destY - lastY;
    const distance = Math.hypot(xDistance, yDistance);
    const flow = getFlowWithTime(distance, config.speed, rng).flow;

    movements.push(buildMovement(destX, destY, xDistance, yDistance, distance, mouseMovementMs, flow));

    lastX = destX;
    lastY = destY;
    mouseMovementMs = deriveNextMouseMovementTimeMs(mouseMovementMs, config.overshoot);
  }

  for (let i = movements.length - 1; i >= 0; i -= 1) {
    const movement = movements[i];
    if (movement.destX === target.x && movement.destY === target.y) {
      lastX = movement.destX - movement.xDistance;
      lastY = movement.destY - movement.yDistance;
      movements.splice(i, 1);
    } else {
      break;
    }
  }

  xDistance = target.x - lastX;
  yDistance = target.y - lastY;
  const finalDistance = Math.hypot(xDistance, yDistance);
  const finalFlowTime = getFlowWithTime(finalDistance, config.speed, rng);
  const finalMovementTime = deriveNextMouseMovementTimeMs(finalFlowTime.timeMs, config.overshoot);
  movements.push(
    buildMovement(target.x, target.y, xDistance, yDistance, finalDistance, finalMovementTime, finalFlowTime.flow),
  );

  return movements;
}

/**
 * @param {Point} current
 * @param {Movement} movement
 * @param {Required<TrajectoryOptions>} config
 * @param {() => number} rng
 * @param {ScreenSize|null} bounds
 * @returns {Point[]}
 */
function computeMovementPoints(current, movement, config, rng, bounds) {
  const points = [];
  const { distance, xDistance, yDistance, timeMs, flow } = movement;
  if (distance <= 0 || !Number.isFinite(distance)) {
    return points;
  }

  const stepCandidates = Math.max(timeMs / config.timeToStepsDivider, config.minSteps);
  const steps = Math.ceil(Math.min(distance, stepCandidates));
  if (!Number.isFinite(steps) || steps <= 0) {
    throw new Error(`Invalid steps calculated: ${steps}`);
  }

  let simulatedMouseX = current.x;
  let simulatedMouseY = current.y;

  const deviationMultiplierX = (rng() - 0.5) * 2;
  const deviationMultiplierY = (rng() - 0.5) * 2;

  let completedXDistance = 0;
  let completedYDistance = 0;
  let noiseX = 0;
  let noiseY = 0;
  const effectFadeSteps = config.effectFadeSteps > 0 ? config.effectFadeSteps : 1;

  for (let i = 0; i < steps; i += 1) {
    const timeCompletion = i / steps;
    const effectFadeStep = Math.max(i - (steps - effectFadeSteps) + 1, 0);
    const effectFadeMultiplier = (effectFadeSteps - effectFadeStep) / effectFadeSteps;

    const xStepSize = flow.getStepSize(xDistance, steps, timeCompletion);
    const yStepSize = flow.getStepSize(yDistance, steps, timeCompletion);

    completedXDistance += xStepSize;
    completedYDistance += yStepSize;
    const completedDistance = Math.hypot(completedXDistance, completedYDistance);
    const completion = Math.min(1, completedDistance / distance);

    const noise = getNoise(rng, xStepSize, yStepSize, config.noise);
    const deviation = getDeviation(distance, completion, config.deviation);

    noiseX += noise.x;
    noiseY += noise.y;
    simulatedMouseX += xStepSize;
    simulatedMouseY += yStepSize;

    let nextX = roundTowards(
      simulatedMouseX + deviation.x * deviationMultiplierX * effectFadeMultiplier + noiseX * effectFadeMultiplier,
      movement.destX,
    );
    let nextY = roundTowards(
      simulatedMouseY + deviation.y * deviationMultiplierY * effectFadeMultiplier + noiseY * effectFadeMultiplier,
      movement.destY,
    );

    nextX = clampToScreen(nextX, "width", bounds);
    nextY = clampToScreen(nextY, "height", bounds);

    points.push({ x: nextX, y: nextY });
  }

  return points;
}

/**
 * @param {number} value
 * @param {number} target
 * @returns {number}
 */
function roundTowards(value, target) {
  return target > value ? Math.ceil(value) : Math.floor(value);
}

/**
 * @param {number} distance
 * @param {SpeedConfig} speedConfig
 * @param {() => number} rng
 * @returns {{flow: Flow, timeMs: number}}
 */
function getFlowWithTime(distance, speedConfig, rng) {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new Error(`Distance must be a non-negative finite number. Got ${distance}.`);
  }
  const baseTimeMs = clampPositive(speedConfig.baseTimeMs, "speed.baseTimeMs");
  const time = baseTimeMs + rng() * baseTimeMs;
  const flows = speedConfig.flows;
  if (!Array.isArray(flows) || flows.length === 0) {
    throw new Error("speed.flows must be a non-empty array.");
  }
  const flowTemplate = flows[Math.floor(rng() * flows.length)];
  if (!Array.isArray(flowTemplate) || flowTemplate.length === 0) {
    throw new Error("Each flow must be a non-empty array of numbers.");
  }
  const flow = new Flow(flowTemplate);

  let adjustedTime = time;
  const timePerBucket = adjustedTime / flow.getFlowCharacteristics().length;
  for (const bucket of flow.getFlowCharacteristics()) {
    if (Math.abs(bucket) < 1e-5) {
      adjustedTime += timePerBucket;
    }
  }

  return { flow, timeMs: Math.round(adjustedTime) };
}

/**
 * @param {number} distance
 * @param {OvershootConfig} overshootConfig
 * @returns {number}
 */
function getOvershoots(distance, overshootConfig) {
  if (distance < overshootConfig.minDistanceForOvershoots) {
    return 0;
  }
  return overshootConfig.overshoots;
}

/**
 * @param {number} distanceToTargetX
 * @param {number} distanceToTargetY
 * @param {number} mouseMovementMs
 * @param {number} overshootsRemaining
 * @param {OvershootConfig} overshootConfig
 * @param {() => number} rng
 * @returns {Point}
 */
function getOvershootAmount(
  distanceToTargetX,
  distanceToTargetY,
  mouseMovementMs,
  overshootsRemaining,
  overshootConfig,
  rng,
) {
  const distanceToTarget = Math.hypot(distanceToTargetX, distanceToTargetY);
  if (!Number.isFinite(distanceToTarget) || distanceToTarget <= 0) {
    return { x: 0, y: 0 };
  }
  const randomModifier = distanceToTarget / overshootConfig.overshootRandomModifierDivider;
  const deltaX = (rng() * randomModifier - randomModifier / 2) * overshootsRemaining;
  const deltaY = (rng() * randomModifier - randomModifier / 2) * overshootsRemaining;
  return { x: Math.trunc(deltaX), y: Math.trunc(deltaY) };
}

/**
 * @param {number} mouseMovementMs
 * @param {OvershootConfig} overshootConfig
 * @returns {number}
 */
function deriveNextMouseMovementTimeMs(mouseMovementMs, overshootConfig) {
  const nextValue = mouseMovementMs / overshootConfig.overshootSpeedupDivider;
  return Math.max(Math.round(nextValue), overshootConfig.minOvershootMovementMs);
}

/**
 * @param {() => number} rng
 * @param {number} xStepSize
 * @param {number} yStepSize
 * @param {NoiseConfig} noiseConfig
 * @returns {DoublePoint}
 */
function getNoise(rng, xStepSize, yStepSize, noiseConfig) {
  if (Math.abs(xStepSize) < 1e-5 && Math.abs(yStepSize) < 1e-5) {
    return { x: 0, y: 0 };
  }
  const stepSize = Math.hypot(xStepSize, yStepSize);
  const noisiness = Math.max(0, 8 - stepSize) / 50;
  if (rng() < noisiness) {
    const magnitude = Math.max(0, 8 - stepSize) / noiseConfig.noisinessDivider;
    return {
      x: (rng() - 0.5) * magnitude,
      y: (rng() - 0.5) * magnitude,
    };
  }
  return { x: 0, y: 0 };
}

/**
 * @param {number} totalDistance
 * @param {number} completionFraction
 * @param {DeviationConfig} deviationConfig
 * @returns {DoublePoint}
 */
function getDeviation(totalDistance, completionFraction, deviationConfig) {
  const clampedCompletion = Math.min(1, Math.max(0, completionFraction));
  const deviationFunctionResult = (1 - Math.cos(clampedCompletion * Math.PI * 2)) / 2;
  const deviationX = totalDistance / deviationConfig.slopeDivider;
  const deviationY = totalDistance / deviationConfig.slopeDivider;
  return {
    x: deviationFunctionResult * deviationX,
    y: deviationFunctionResult * deviationY,
  };
}

/**
 * @param {number} value
 * @param {"width"|"height"} axis
 * @param {ScreenSize|null} bounds
 * @returns {number}
 */
function clampToScreen(value, axis, bounds) {
  if (!bounds) {
    return value;
  }
  const limit = axis === "width" ? bounds.width : bounds.height;
  if (!Number.isFinite(limit) || limit <= 0) {
    return value;
  }
  return Math.max(0, Math.min(limit - 1, value));
}

/**
 * @param {Point} point
 * @param {ScreenSize|null} bounds
 * @returns {Point}
 */
function clampPointToBounds(point, bounds) {
  if (!bounds) {
    return point;
  }
  return {
    x: clampToScreen(point.x, "width", bounds),
    y: clampToScreen(point.y, "height", bounds),
  };
}

/**
 * @param {TrajectoryOptions} options
 * @returns {Required<TrajectoryOptions>}
 */
function normalizeOptions(options) {
  const speed = { ...DEFAULT_SPEED_CONFIG, ...options.speed };
  const overshoot = { ...DEFAULT_OVERSHOOT_CONFIG, ...options.overshoot };
  const noise = { ...DEFAULT_NOISE_CONFIG, ...options.noise };
  const deviation = { ...DEFAULT_DEVIATION_CONFIG, ...options.deviation };

  return {
    minSteps: clampPositive(options.minSteps ?? DEFAULT_OPTIONS.minSteps, "minSteps"),
    effectFadeSteps: clampPositive(options.effectFadeSteps ?? DEFAULT_OPTIONS.effectFadeSteps, "effectFadeSteps"),
    timeToStepsDivider: clampPositive(options.timeToStepsDivider ?? DEFAULT_OPTIONS.timeToStepsDivider, "timeToStepsDivider"),
    reactionTimeBaseMs: clampPositive(options.reactionTimeBaseMs ?? DEFAULT_OPTIONS.reactionTimeBaseMs, "reactionTimeBaseMs"),
    reactionTimeVariationMs: clampPositive(
      options.reactionTimeVariationMs ?? DEFAULT_OPTIONS.reactionTimeVariationMs,
      "reactionTimeVariationMs",
    ),
    speed: normalizeSpeedConfig(speed),
    overshoot: normalizeOvershootConfig(overshoot),
    noise: normalizeNoiseConfig(noise),
    deviation: normalizeDeviationConfig(deviation),
    screenSize: options.screenSize ?? null,
    seed: options.seed ?? null,
    random: options.random ?? null,
  };
}

/**
 * @param {SpeedConfig} speed
 * @returns {SpeedConfig}
 */
function normalizeSpeedConfig(speed) {
  const baseTimeMs = clampPositive(speed.baseTimeMs, "speed.baseTimeMs");
  if (!Array.isArray(speed.flows) || speed.flows.length === 0) {
    throw new Error("speed.flows must be a non-empty array.");
  }
  for (const [index, flow] of speed.flows.entries()) {
    if (!Array.isArray(flow) || flow.length === 0) {
      throw new Error(`speed.flows[${index}] must be a non-empty array.`);
    }
  }
  return { baseTimeMs, flows: speed.flows };
}

/**
 * @param {OvershootConfig} overshoot
 * @returns {OvershootConfig}
 */
function normalizeOvershootConfig(overshoot) {
  return {
    overshoots: clampNonNegative(overshoot.overshoots, "overshoot.overshoots"),
    minOvershootMovementMs: clampPositive(overshoot.minOvershootMovementMs, "overshoot.minOvershootMovementMs"),
    minDistanceForOvershoots: clampPositive(overshoot.minDistanceForOvershoots, "overshoot.minDistanceForOvershoots"),
    overshootRandomModifierDivider: clampPositive(
      overshoot.overshootRandomModifierDivider,
      "overshoot.overshootRandomModifierDivider",
    ),
    overshootSpeedupDivider: clampPositive(overshoot.overshootSpeedupDivider, "overshoot.overshootSpeedupDivider"),
  };
}

/**
 * @param {NoiseConfig} noise
 * @returns {NoiseConfig}
 */
function normalizeNoiseConfig(noise) {
  return { noisinessDivider: clampPositive(noise.noisinessDivider, "noise.noisinessDivider") };
}

/**
 * @param {DeviationConfig} deviation
 * @returns {DeviationConfig}
 */
function normalizeDeviationConfig(deviation) {
  return { slopeDivider: clampPositive(deviation.slopeDivider, "deviation.slopeDivider") };
}

/**
 * @param {Point} point
 * @param {string} label
 * @returns {Point}
 */
function normalizePoint(point, label) {
  if (!point || typeof point !== "object") {
    throw new TypeError(`${label} must be an object with numeric x and y values.`);
  }
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError(`${label}.x and ${label}.y must be finite numbers.`);
  }
  return { x, y };
}

/**
 * @param {ScreenSize|undefined} screenSize
 * @returns {ScreenSize|null}
 */
function normalizeScreenSize(screenSize) {
  if (!screenSize) {
    return null;
  }
  if (typeof screenSize !== "object") {
    throw new TypeError("screenSize must be an object with width and height.");
  }
  const width = Number(screenSize.width);
  const height = Number(screenSize.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError("screenSize.width and screenSize.height must be finite numbers.");
  }
  return { width, height };
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function ensurePlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {TrajectoryOptions} options
 * @returns {() => number}
 */
function createRng(options) {
  if (typeof options.random === "function") {
    return wrapRng(options.random, "options.random");
  }
  if (options.random && typeof options.random === "object" && typeof options.random.next === "function") {
    return wrapRng(options.random.next.bind(options.random), "options.random.next");
  }
  if (typeof options.seed === "number") {
    return mulberry32(options.seed);
  }
  return wrapRng(Math.random, "Math.random");
}

/**
 * @param {() => number} rng
 * @param {string} label
 * @returns {() => number}
 */
function wrapRng(rng, label) {
  return () => {
    const value = rng();
    if (!Number.isFinite(value)) {
      throw new Error(`${label} returned a non-finite number.`);
    }
    if (value < 0 || value > 1) {
      throw new Error(`${label} must return a value in the range [0, 1].`);
    }
    return value;
  };
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} value
 * @param {string} label
 * @returns {number}
 */
function clampPositive(value, label) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
  return numberValue;
}

/**
 * @param {number} value
 * @param {string} label
 * @returns {number}
 */
function clampNonNegative(value, label) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
  return numberValue;
}

/**
 * @param {number} destX
 * @param {number} destY
 * @param {number} xDistance
 * @param {number} yDistance
 * @param {number} distance
 * @param {number} timeMs
 * @param {Flow} flow
 * @returns {Movement}
 */
function buildMovement(destX, destY, xDistance, yDistance, distance, timeMs, flow) {
  return {
    destX,
    destY,
    distance,
    xDistance,
    yDistance,
    timeMs,
    flow,
  };
}

/**
 * @class
 */
class Flow {
  /**
   * @param {number[]} characteristics
   */
  constructor(characteristics) {
    if (!Array.isArray(characteristics) || characteristics.length === 0) {
      throw new Error("Flow characteristics must be a non-empty array.");
    }
    this._buckets = Flow.normalizeBuckets(characteristics);
  }

  /**
   * @returns {number[]}
   */
  getFlowCharacteristics() {
    return this._buckets.slice();
  }

  /**
   * @param {number} distance
   * @param {number} steps
   * @param {number} completion
   * @returns {number}
   */
  getStepSize(distance, steps, completion) {
    const completionStep = 1 / steps;
    const bucketFrom = completion * this._buckets.length;
    const bucketUntil = (completion + completionStep) * this._buckets.length;
    const bucketContents = this._getBucketsContents(bucketFrom, bucketUntil);
    const distancePerBucket = distance / (this._buckets.length * 100);
    return bucketContents * distancePerBucket;
  }

  /**
   * @param {number[]} characteristics
   * @returns {number[]}
   */
  static normalizeBuckets(characteristics) {
    const buckets = new Array(characteristics.length);
    let sum = 0;
    for (let i = 0; i < characteristics.length; i += 1) {
      const value = characteristics[i];
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid FlowCharacteristics at [${i}]: ${value}`);
      }
      sum += value;
    }
    if (sum === 0) {
      throw new Error("Invalid FlowCharacteristics. All array elements can't be 0.");
    }
    const multiplier = (100 * buckets.length) / sum;
    for (let i = 0; i < characteristics.length; i += 1) {
      buckets[i] = characteristics[i] * multiplier;
    }
    return buckets;
  }

  /**
   * @param {number} bucketFrom
   * @param {number} bucketUntil
   * @returns {number}
   */
  _getBucketsContents(bucketFrom, bucketUntil) {
    let sum = 0;
    for (let i = Math.trunc(bucketFrom); i < bucketUntil; i += 1) {
      let value = this._buckets[i];
      let endMultiplier = 1;
      let startMultiplier = 0;
      if (bucketUntil < i + 1) {
        endMultiplier = bucketUntil - Math.trunc(bucketUntil);
      }
      if (Math.trunc(bucketFrom) === i) {
        startMultiplier = bucketFrom - Math.trunc(bucketFrom);
      }
      value *= endMultiplier - startMultiplier;
      sum += value;
    }
    return sum;
  }
}


module.exports = {
  trajectory,
  flowTemplates,
};
