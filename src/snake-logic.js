export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 }
};

const OPPOSITE_DIRECTION = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT"
};

function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

export function placeFood({ width, height, snake, rng = Math.random }) {
  const occupied = new Set(snake.map(cellKey));
  const empty = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        empty.push({ x, y });
      }
    }
  }

  if (empty.length === 0) {
    return null;
  }

  const index = Math.floor(rng() * empty.length);
  return empty[index];
}

export function createInitialState({ width = 20, height = 20, rng = Math.random } = {}) {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const snake = [
    { x: centerX + 1, y: centerY },
    { x: centerX, y: centerY },
    { x: centerX - 1, y: centerY }
  ];

  return {
    width,
    height,
    snake,
    direction: "RIGHT",
    pendingDirection: "RIGHT",
    food: placeFood({ width, height, snake, rng }),
    score: 0,
    isGameOver: false,
    isPaused: false
  };
}

export function setDirection(state, requestedDirection) {
  if (!DIRECTIONS[requestedDirection] || state.isGameOver) {
    return state;
  }

  const currentDirection = state.pendingDirection || state.direction;
  if (OPPOSITE_DIRECTION[currentDirection] === requestedDirection && state.snake.length > 1) {
    return state;
  }

  return {
    ...state,
    pendingDirection: requestedDirection
  };
}

export function togglePause(state) {
  if (state.isGameOver) {
    return state;
  }

  return {
    ...state,
    isPaused: !state.isPaused
  };
}

export function restart(state, rng = Math.random) {
  return createInitialState({ width: state.width, height: state.height, rng });
}

export function stepGame(state, rng = Math.random) {
  if (state.isGameOver || state.isPaused) {
    return state;
  }

  const direction = state.pendingDirection || state.direction;
  const movement = DIRECTIONS[direction];
  const nextHead = {
    x: state.snake[0].x + movement.x,
    y: state.snake[0].y + movement.y
  };

  const hitWall =
    nextHead.x < 0 || nextHead.x >= state.width || nextHead.y < 0 || nextHead.y >= state.height;
  if (hitWall) {
    return {
      ...state,
      direction,
      pendingDirection: direction,
      isGameOver: true
    };
  }

  const willEat = state.food && nextHead.x === state.food.x && nextHead.y === state.food.y;
  const bodyToCheck = willEat ? state.snake : state.snake.slice(0, -1);
  const hitSelf = bodyToCheck.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);
  if (hitSelf) {
    return {
      ...state,
      direction,
      pendingDirection: direction,
      isGameOver: true
    };
  }

  const nextSnake = [nextHead, ...state.snake];
  if (!willEat) {
    nextSnake.pop();
  }

  const nextFood = willEat
    ? placeFood({ width: state.width, height: state.height, snake: nextSnake, rng })
    : state.food;

  return {
    ...state,
    snake: nextSnake,
    direction,
    pendingDirection: direction,
    food: nextFood,
    score: willEat ? state.score + 1 : state.score,
    isGameOver: nextFood === null ? true : state.isGameOver
  };
}
