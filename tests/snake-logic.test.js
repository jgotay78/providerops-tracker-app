import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialState,
  placeFood,
  setDirection,
  stepGame
} from "../src/snake-logic.js";

test("initial state creates food outside snake", () => {
  const state = createInitialState({ width: 10, height: 10, rng: () => 0 });
  const snakeSet = new Set(state.snake.map((cell) => `${cell.x},${cell.y}`));
  assert.ok(state.food);
  assert.equal(snakeSet.has(`${state.food.x},${state.food.y}`), false);
});

test("stepGame moves snake one cell in the current direction", () => {
  const state = {
    width: 8,
    height: 8,
    snake: [
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 }
    ],
    direction: "RIGHT",
    pendingDirection: "RIGHT",
    food: { x: 7, y: 7 },
    score: 0,
    isGameOver: false,
    isPaused: false
  };

  const next = stepGame(state, () => 0);
  assert.deepEqual(next.snake[0], { x: 4, y: 3 });
  assert.equal(next.snake.length, 3);
});

test("setDirection rejects direct reverse movement", () => {
  const state = createInitialState({ width: 10, height: 10, rng: () => 0 });
  const next = setDirection(state, "LEFT");
  assert.equal(next.pendingDirection, "RIGHT");
});

test("snake grows and score increments when eating food", () => {
  const state = {
    width: 8,
    height: 8,
    snake: [
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 }
    ],
    direction: "RIGHT",
    pendingDirection: "RIGHT",
    food: { x: 4, y: 3 },
    score: 0,
    isGameOver: false,
    isPaused: false
  };

  const next = stepGame(state, () => 0);
  assert.equal(next.score, 1);
  assert.equal(next.snake.length, 4);
  assert.notDeepEqual(next.food, { x: 4, y: 3 });
});

test("game ends on wall collision", () => {
  const state = {
    width: 5,
    height: 5,
    snake: [
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 2 }
    ],
    direction: "RIGHT",
    pendingDirection: "RIGHT",
    food: { x: 0, y: 0 },
    score: 0,
    isGameOver: false,
    isPaused: false
  };

  const next = stepGame(state, () => 0);
  assert.equal(next.isGameOver, true);
});

test("game ends on self collision", () => {
  const state = {
    width: 6,
    height: 6,
    snake: [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
      { x: 1, y: 2 }
    ],
    direction: "LEFT",
    pendingDirection: "DOWN",
    food: { x: 5, y: 5 },
    score: 0,
    isGameOver: false,
    isPaused: false
  };

  const next = stepGame(state, () => 0);
  assert.equal(next.isGameOver, true);
});

test("placeFood picks only available empty cell", () => {
  const food = placeFood({
    width: 2,
    height: 2,
    snake: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 }
    ],
    rng: () => 0.5
  });

  assert.deepEqual(food, { x: 1, y: 1 });
});
