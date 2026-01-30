# Cursory

Cursory is a CommonJS JavaScript port of NaturalMouseMotion that generates natural-looking cursor trajectories between two points without touching the real cursor. Use `const { trajectory } = require("./cursory.js")` to build a path array of `{ x, y }` points, optionally customizing noise, deviation, overshoot, and flow settings for your own motion profiles.
