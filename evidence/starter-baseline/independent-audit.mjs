// AI-operated audit of the untouched 2026-10-27 robotics starter; no student authorship claim.
import assert from 'node:assert/strict';
import { makeMap, plan, verifyPath, randomMap } from '../../reference/ai-starter/src/core.mjs';

function bfsDistance(map) {
  const queue = [[...map.start, 0]];
  const seen = new Set([`${map.start[0]},${map.start[1]}`]);
  for (let head = 0; head < queue.length; head++) {
    const [x, y, distance] = queue[head];
    if (x === map.goal[0] && y === map.goal[1]) return distance;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height || map.cells[ny * map.width + nx]) continue;
      const id = `${nx},${ny}`;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push([nx, ny, distance + 1]);
    }
  }
  return null;
}

let solvable = 0;
const movable = [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]];
for (let mask = 0; mask < 128; mask++) {
  const map = makeMap(3, 3, movable.filter((_, i) => mask & (1 << i)));
  const expected = bfsDistance(map);
  if (expected !== null) solvable++;
  for (const algorithm of ['astar', 'dijkstra', 'greedy']) {
    const actual = plan(map, algorithm);
    assert.equal(actual.success, expected !== null);
    if (actual.success) {
      assert.equal(verifyPath(map, actual.path), true);
      if (algorithm !== 'greedy') assert.equal(actual.pathLength, expected);
    } else assert.equal(actual.reason, 'UNREACHABLE');
  }
}

let originalSampleSolvable = 0;
for (let seed = 1; seed < 70; seed++) {
  if (plan(randomMap(seed, 12, 10, 0.19), 'dijkstra').success) originalSampleSolvable++;
}
const map = makeMap(3, 3);
const budget8 = plan(map, 'astar', 8);
const budget9 = plan(map, 'astar', 9);
assert.equal(budget8.reason, 'BUDGET_EXCEEDED');
assert.equal(budget8.expanded, 8);
assert.equal(budget9.success, true);
assert.equal(budget9.expanded, 9);

// A demonstrated limitation: the helper accepts fractional diagonal coordinates.
const malformedPath = [[0, 0], [0.5, 0.5], [1, 1], [1.5, 1.5], [2, 2]];
const acceptsFractionalPath = verifyPath(map, malformedPath);
assert.equal(acceptsFractionalPath, true);

console.log(JSON.stringify({
  provenance: 'AI-operated audit; robotics reference only; no student work or attendance validation',
  gridChecks: { layouts: 128, solvable, unreachable: 128 - solvable, algorithms: ['astar', 'dijkstra', 'greedy'], searchResultsChecked: 384 },
  originalSampleSolvable,
  budgetBoundary: { budget8: { reason: budget8.reason, expanded: budget8.expanded }, budget9: { success: budget9.success, expanded: budget9.expanded } },
  demonstratedLimitation: { acceptsFractionalPath, malformedPath }
}, null, 2));
