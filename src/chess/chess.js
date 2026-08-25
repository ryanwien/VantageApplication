// Bull vs Bear chess rules — extracted from React.jsx so legality logic is unit-testable.
// Casual scope: no castling or en-passant, pawns auto-promote to queens. But movement is
// fully LEGAL: no side may leave its own king in check, and games end by checkmate or
// stalemate — never by a king wandering into capture mid-game.

// Two armies, two silhouettes. The Bears (black) carry the FILLED glyphs and
// the Bulls (white) the OUTLINE ones, which is how a printed board has always
// done it — and it means the two sides stay separable when the green and the
// red do not separate, which for a red-green colourblind player is always.
// Module-local: the board asks for a glyph by side, never by set. Exporting the
// two tables as well would let a caller reach for the wrong army.
const BEAR_SET = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const BULL_SET = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };
export const chessGlyph = (side, type) => (side === "w" ? BULL_SET : BEAR_SET)[type];

const FILES = "abcdefgh";
// Rank 8 is row 0: the board is authored from the Bears' back rank downwards.
export const chessSquare = (r, c) => `${FILES[c]}${8 - r}`;
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

// ============================================================
//  READOUTS — everything the match rail displays is derived here.
//
//  The handoff's one hard rule for this screen is that the rail may never
//  contradict the board. The only way to guarantee that is for the rail to own
//  no numbers of its own: material, piece counts, centre control and the move
//  text are all functions of the position, computed on the way past.
// ============================================================

// How many of `side`'s pieces attack (r,c)?
//
// Not "how many can MOVE there" — those are different questions, and the
// difference is the whole point. A defender cannot move onto the square its
// friend is standing on, and a pawn attacks diagonally onto squares it can
// never push to. So the target square is emptied first, and pawns are counted
// by their capture diagonals rather than by their moves.
export function chessAttacks(board, r, c, side) {
  const probe = board.map(row => row.slice());
  probe[r][c] = null;
  let n = 0;
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    const p = probe[x][y];
    if (!p || p.s !== side) continue;
    if (p.t === "p") {
      const dir = p.s === "w" ? -1 : 1;
      if (x + dir === r && Math.abs(y - c) === 1) n++;
    } else if (chessMoves(probe, x, y).some(m => m.r === r && m.c === c)) n++;
  }
  return n;
}

// Pieces on the board and material behind them, per side. The king is excluded
// from material — it is worth 1000 precisely so nothing ever trades it, and a
// "MATERIAL 1039" readout would be nonsense.
export function chessCount(board) {
  const out = { w: { pieces: 0, material: 0 }, b: { pieces: 0, material: 0 } };
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (!p) continue;
    out[p.s].pieces += 1;
    if (p.t !== "k") out[p.s].material += CHESS_VAL[p.t];
  }
  return out;
}

// The four centre squares, and who is pressing on them. Occupying counts once,
// and so does every piece aiming at it — which is why the opening position
// scores 0-0 rather than 2-2: at move one nobody has a piece pointed at the
// centre, they just have pawns standing next to it.
const CENTRE = [[4, 3], [3, 3], [4, 4], [3, 4]];   // d4 d5 e4 e5
export function chessCentre(board) {
  const out = { w: 0, b: 0 };
  for (const [r, c] of CENTRE) {
    const p = board[r][c];
    if (p) out[p.s] += 1;
    out.w += chessAttacks(board, r, c, "w");
    out.b += chessAttacks(board, r, c, "b");
  }
  return out;
}

const SAN_LETTER = { k: "K", q: "Q", r: "R", b: "B", n: "N", p: "" };

// Standard algebraic notation for a move about to be played. No check or mate
// suffix: that depends on the position AFTER the move, which the caller has and
// this does not, so the caller appends it.
//
// Disambiguation is included, because a move list you cannot replay is a
// decoration. If a second knight could also legally reach f3, the move is Ngf3
// or N1f3 — never a bare Nf3 that describes two different moves.
export function chessSan(board, from, to) {
  const p = board[from.r][from.c];
  if (!p) return "";
  const taken = !!board[to.r][to.c];
  const dest = chessSquare(to.r, to.c);
  if (p.t === "p") {
    const promo = (to.r === 0 || to.r === 7) ? "=Q" : "";
    return taken ? `${FILES[from.c]}x${dest}${promo}` : `${dest}${promo}`;
  }
  let rival = false, sameFile = false, sameRank = false;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (r === from.r && c === from.c) continue;
    const q = board[r][c];
    if (!q || q.s !== p.s || q.t !== p.t) continue;
    if (!legalMoves(board, r, c).some(m => m.r === to.r && m.c === to.c)) continue;
    rival = true;
    if (c === from.c) sameFile = true;
    if (r === from.r) sameRank = true;
  }
  const mark = !rival ? ""
    : !sameFile ? FILES[from.c]
    : !sameRank ? String(8 - from.r)
    : chessSquare(from.r, from.c);
  return `${SAN_LETTER[p.t]}${mark}${taken ? "x" : ""}${dest}`;
}

// ============================================================
//  THE HOUSE — one engine, three temperaments.
//
//  The rail offers Passive / Balanced / Ruthless, so those three have to play
//  like three different opponents rather than three labels on one. They differ
//  in exactly one thing: how far ahead they look before taking a piece.
//
//    passive   — takes only what is free, and only if it is worth taking.
//                Otherwise it develops and waits. It will not start a trade.
//    balanced  — looks one square ahead: what it wins, minus what it loses if
//                the piece it just moved is taken straight back. This is the
//                one that stops the queen eating a defended pawn.
//    ruthless  — looks one MOVE ahead: what it wins, minus the best thing the
//                opponent can take anywhere on the board in reply. It also
//                stops to check for mate, and plays it when it is there.
//
//  All three only ever choose among fully legal moves, so none of them can
//  walk a king into check or move a pinned piece.
// ============================================================

// The single most valuable thing `side` can capture on this board, ignoring
// whether the capture is wise. Pseudo-legal on purpose: this is the pessimistic
// half of a two-ply score, and over-estimating the reply is the safe direction.
function bestGrab(board, side) {
  let best = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (!p || p.s !== side) continue;
    for (const m of chessMoves(board, r, c)) {
      const tgt = board[m.r][m.c];
      if (tgt && tgt.t !== "k" && CHESS_VAL[tgt.t] > best) best = CHESS_VAL[tgt.t];
    }
  }
  return best;
}

export function chessAIMove(board, side, algo = "balanced") {
  const opp = side === "w" ? "b" : "w";
  const scored = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (!p || p.s !== side) continue;
    for (const to of legalMoves(board, r, c)) {
      const tgt = board[to.r][to.c];
      const gain = tgt ? CHESS_VAL[tgt.t] : 0;
      const { next } = chessApply(board, { r, c }, to);
      const landed = next[to.r][to.c];               // a promoted pawn is a queen now
      let score;
      if (algo === "ruthless") {
        // Mate ends the search — there is nothing to weigh it against.
        if (inCheck(next, opp) && gameStatus(next, opp) === "checkmate") return { from: { r, c }, to, val: gain };
        score = gain - bestGrab(next, opp) + (inCheck(next, opp) ? 0.4 : 0);
      } else {
        const risk = chessAttacks(next, to.r, to.c, opp) ? CHESS_VAL[landed.t] : 0;
        if (algo === "passive") {
          // Free material only, and only if it is worth more than a pawn: a
          // passive house does not initiate, it answers. Everything else scores
          // zero — EXCEPT a move that loses more than it wins, which has to go
          // negative. Scoring the whole board flat would leave the blunder in
          // the tie-break pool, and a setting that still hangs its queen at
          // random is not a temperament, it is a label.
          score = risk > gain ? gain - risk : (risk === 0 && gain >= 3 ? gain : 0);
        } else {
          score = gain - risk + (inCheck(next, opp) ? 0.4 : 0);
        }
      }
      scored.push({ from: { r, c }, to, val: score });
    }
  }
  if (!scored.length) return null;
  const best = Math.max(...scored.map(m => m.val));
  const pool = scored.filter(m => m.val === best);
  return pool[Math.floor(Math.random() * pool.length)];
}

// The move the coach points at, for one piece. Same arithmetic as the balanced
// house — what it wins, minus what it loses if it is taken straight back — plus
// a nudge for the four centre squares.
//
// That nudge is what makes the opening advice specific rather than generic: the
// d2 pawn's two moves are equally free and equally safe, so on material alone
// the coach would be flipping a coin between d3 and d4. It is d4 that claims
// the middle of the board, and that is the whole reason to prefer it.
export function chessSuggest(board, from) {
  const p = board[from.r][from.c];
  if (!p) return null;
  const opp = p.s === "w" ? "b" : "w";
  let best = null, bestScore = -Infinity;
  for (const to of legalMoves(board, from.r, from.c)) {
    const tgt = board[to.r][to.c];
    const { next } = chessApply(board, from, to);
    const risk = chessAttacks(next, to.r, to.c, opp) ? CHESS_VAL[next[to.r][to.c].t] : 0;
    const centre = CENTRE.some(([r, c]) => r === to.r && c === to.c) ? 0.35 : 0;
    const score = (tgt ? CHESS_VAL[tgt.t] : 0) - risk + centre + (inCheck(next, opp) ? 0.2 : 0);
    if (score > bestScore) { bestScore = score; best = to; }
  }
  return best;
}
