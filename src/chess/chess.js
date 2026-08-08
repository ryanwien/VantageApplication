// Bull vs Bear chess rules — extracted from React.jsx so legality logic is unit-testable.
// Casual scope: no castling or en-passant, pawns auto-promote to queens. But movement is
// fully LEGAL: no side may leave its own king in check, and games end by checkmate or
// stalemate — never by a king wandering into capture mid-game.

export const CHESS_GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
export const CHESS_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 1000 };

export function chessInit() {
  const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) { b[0][c] = { s: "b", t: back[c] }; b[1][c] = { s: "b", t: "p" }; b[6][c] = { s: "w", t: "p" }; b[7][c] = { s: "w", t: back[c] }; }
  return b;
}

// pseudo-legal moves for the piece at (r,c) — ignores whether the mover's king is left in check
export function chessMoves(board, r, c) {
  const p = board[r][c]; if (!p) return [];
  const out = [], inB = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8;
  const own = (x, y) => inB(x, y) && board[x][y] && board[x][y].s === p.s;
  const enemy = (x, y) => inB(x, y) && board[x][y] && board[x][y].s !== p.s;
  const empty = (x, y) => inB(x, y) && !board[x][y];
  const ray = (dirs) => { for (const [dx, dy] of dirs) { let x = r + dx, y = c + dy; while (empty(x, y)) { out.push({ r: x, c: y }); x += dx; y += dy; } if (enemy(x, y)) out.push({ r: x, c: y }); } };
  if (p.t === "p") {
    const dir = p.s === "w" ? -1 : 1, start = p.s === "w" ? 6 : 1;
    if (empty(r + dir, c)) { out.push({ r: r + dir, c }); if (r === start && empty(r + 2 * dir, c)) out.push({ r: r + 2 * dir, c }); }
    for (const dc of [-1, 1]) if (enemy(r + dir, c + dc)) out.push({ r: r + dir, c: c + dc });
  } else if (p.t === "n") {
    for (const [dx, dy] of [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]]) { const x = r + dx, y = c + dy; if (inB(x, y) && !own(x, y)) out.push({ r: x, c: y }); }
  } else if (p.t === "b") ray([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
  else if (p.t === "r") ray([[-1, 0], [1, 0], [0, -1], [0, 1]]);
  else if (p.t === "q") ray([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
  else if (p.t === "k") { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (!dx && !dy) continue; const x = r + dx, y = c + dy; if (inB(x, y) && !own(x, y)) out.push({ r: x, c: y }); } }
  return out;
}

// return a NEW board with the piece moved from→to (immutable; assumes the move was already validated)
export function chessApply(bd, from, to) {
  const next = bd.map(row => row.slice());
  const moving = next[from.r][from.c];
  const taken = next[to.r][to.c];
  next[to.r][to.c] = moving; next[from.r][from.c] = null;
  if (moving.t === "p" && (to.r === 0 || to.r === 7)) next[to.r][to.c] = { s: moving.s, t: "q" }; // auto-queen
  return { next, taken };
}

// is `side`'s king currently attacked? (no king on board → not in check, keeps the casual backstop safe)
export function inCheck(board, side) {
  let kr = -1, kc = -1;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.s === side && p.t === "k") { kr = r; kc = c; }
  }
  if (kr < 0) return false;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.s !== side && chessMoves(board, r, c).some(m => m.r === kr && m.c === kc)) return true;
  }
  return false;
}

// pseudo-legal moves minus any that leave the mover's own king in check (covers pins, checks, king safety)
export function legalMoves(board, r, c) {
  const p = board[r][c]; if (!p) return [];
  return chessMoves(board, r, c).filter(m => !inCheck(chessApply(board, { r, c }, m).next, p.s));
}

// 'checkmate' | 'stalemate' | 'check' | 'playing' — for the side about to move
export function gameStatus(board, side) {
  let any = false;
  for (let r = 0; r < 8 && !any; r++) for (let c = 0; c < 8 && !any; c++) {
    const p = board[r][c];
    if (p && p.s === side && legalMoves(board, r, c).length) any = true;
  }
  const check = inCheck(board, side);
  if (!any) return check ? "checkmate" : "stalemate";
  return check ? "check" : "playing";
}

// simple greedy AI over LEGAL moves: most valuable capture available, otherwise a random legal move
export function chessAIMove(board, side) {
  const moves = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.s === side) for (const t of legalMoves(board, r, c)) {
      const tgt = board[t.r][t.c];
      moves.push({ from: { r, c }, to: t, val: tgt ? CHESS_VAL[tgt.t] : 0 });
    }
  }
  if (!moves.length) return null;
  const best = Math.max(...moves.map(m => m.val));
  const pool = moves.filter(m => m.val === best);
  return pool[Math.floor(Math.random() * pool.length)];
}
