import { describe, it, expect } from "vitest";
import {
  chessInit, chessMoves, legalMoves, chessApply, inCheck, gameStatus, chessAIMove,
  chessGlyph, chessSquare, chessAttacks, chessCount, chessCentre, chessSan, chessSuggest,
} from "./chess.js";

const emptyBoard = () => Array.from({ length: 8 }, () => Array(8).fill(null));
const piece = (s, t) => ({ s, t });
const has = (moves, r, c) => moves.some(m => m.r === r && m.c === c);

// ---- characterization: existing casual behavior that must survive the extraction ----
describe("basic moves (characterization)", () => {
  it("pawns get a double-step from their start rank only", () => {
    const b = chessInit();
    expect(has(chessMoves(b, 6, 4), 4, 4)).toBe(true);   // e2 → e4
    const { next } = chessApply(b, { r: 6, c: 4 }, { r: 5, c: 4 });
    expect(has(chessMoves(next, 5, 4), 3, 4)).toBe(false); // no double-step after moving
  });

  it("pawns auto-promote to queens on the last rank", () => {
    const b = emptyBoard();
    b[1][0] = piece("w", "p");
    b[7][4] = piece("w", "k"); b[0][7] = piece("b", "k");
    const { next } = chessApply(b, { r: 1, c: 0 }, { r: 0, c: 0 });
    expect(next[0][0]).toEqual({ s: "w", t: "q" });
  });

  it("AI still takes the most valuable safe capture", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k"); b[0][7] = piece("b", "k"); // black king out of the queen's reach
    b[4][4] = piece("w", "q");                 // white queen can take either
    b[4][0] = piece("b", "q");                 // undefended black queen (same row)
    b[2][2] = piece("b", "p");                 // and a mere pawn (diagonal)
    const mv = chessAIMove(b, "w");
    expect(mv.to).toEqual({ r: 4, c: 0 });
  });
});

// ---- the fix: full legality (no more king suicide / ignored checks) ----
describe("legal move filtering", () => {
  it("the king may not step onto an attacked square", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k");                 // white king e1
    b[0][3] = piece("b", "r");                 // black rook d8 covers the d-file
    b[0][7] = piece("b", "k");
    const legal = legalMoves(b, 7, 4);
    expect(has(legal, 7, 3)).toBe(false);      // d1 is covered
    expect(has(legal, 6, 3)).toBe(false);      // d2 is covered
    expect(has(legal, 7, 5)).toBe(true);       // f1 is safe
  });

  it("a pinned piece cannot move and expose its own king", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k");                 // white king e1
    b[6][4] = piece("w", "b");                 // white bishop e2, pinned by...
    b[0][4] = piece("b", "r");                 // ...black rook e8
    b[0][7] = piece("b", "k");
    expect(chessMoves(b, 6, 4).length).toBeGreaterThan(0); // pseudo-legal moves exist
    expect(legalMoves(b, 6, 4)).toHaveLength(0);           // but none are legal
  });

  it("while in check, only moves that resolve the check are legal", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k");                 // white king e1, checked by...
    b[0][4] = piece("b", "r");                 // ...black rook e8
    b[6][0] = piece("w", "r");                 // white rook a2 can block on e2
    b[0][7] = piece("b", "k");
    expect(inCheck(b, "w")).toBe(true);
    const rookLegal = legalMoves(b, 6, 0);
    expect(has(rookLegal, 6, 4)).toBe(true);   // block on e2: legal
    expect(has(rookLegal, 5, 0)).toBe(false);  // random rook move: still in check, illegal
  });
});

describe("game status", () => {
  it("detects back-rank checkmate", () => {
    const b = emptyBoard();
    b[0][7] = piece("b", "k");                 // black king h8
    b[1][6] = piece("b", "p"); b[1][7] = piece("b", "p"); // own pawns g7/h7 box it in
    b[0][0] = piece("w", "r");                 // white rook a8 delivers mate
    b[7][4] = piece("w", "k");
    expect(gameStatus(b, "b")).toBe("checkmate");
  });

  it("detects stalemate (no legal moves, not in check)", () => {
    const b = emptyBoard();
    b[0][0] = piece("b", "k");                 // black king a8
    b[1][2] = piece("w", "q");                 // white queen c7 — classic stalemate net
    b[7][4] = piece("w", "k");
    expect(inCheck(b, "b")).toBe(false);
    expect(gameStatus(b, "b")).toBe("stalemate");
  });

  it("reports check and playing states", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k");
    b[0][4] = piece("b", "r");
    b[6][0] = piece("w", "r");                 // white can block, so just check
    b[0][7] = piece("b", "k");
    expect(gameStatus(b, "w")).toBe("check");
    expect(gameStatus(chessInit(), "w")).toBe("playing");
  });
});

describe("AI legality (the screenshot bug)", () => {
  it("never walks its king onto an attacked square", () => {
    // black king cornered but safe; its only pseudo-legal king moves are covered by white.
    // black also has one safe pawn move — the AI must pick that, never the king suicide.
    const b = emptyBoard();
    b[0][7] = piece("b", "k");                 // black king h8
    b[2][6] = piece("w", "q");                 // white queen g6 covers g7/h7/g8
    b[7][4] = piece("w", "k");
    b[1][0] = piece("b", "p");                 // black pawn a7 has safe moves
    for (let i = 0; i < 30; i++) {
      const mv = chessAIMove(b, "b");
      expect(b[mv.from.r][mv.from.c].t).toBe("p"); // only the pawn moves are legal
    }
  });

  it("only ever returns fully legal moves across random game play", () => {
    for (let g = 0; g < 20; g++) {
      let board = chessInit(), side = "w";
      for (let ply = 0; ply < 60; ply++) {
        if (gameStatus(board, side) === "checkmate" || gameStatus(board, side) === "stalemate") break;
        const mv = chessAIMove(board, side);
        expect(mv).not.toBeNull();
        expect(has(legalMoves(board, mv.from.r, mv.from.c), mv.to.r, mv.to.c)).toBe(true);
        board = chessApply(board, mv.from, mv.to).next;
        side = side === "w" ? "b" : "w";
      }
    }
  });

  it("returns null only when the side has no legal moves at all", () => {
    const b = emptyBoard();
    b[0][0] = piece("b", "k");
    b[1][2] = piece("w", "q");                 // stalemate net from above
    b[7][4] = piece("w", "k");
    expect(chessAIMove(b, "b")).toBeNull();
  });
});

// ---- the readouts the match rail reads off the position ----
describe("board readouts", () => {
  it("gives the two sides different silhouettes", () => {
    expect(chessGlyph("w", "k")).toBe("♔");   // Bulls: outline
    expect(chessGlyph("b", "k")).toBe("♚");   // Bears: filled
    // Every type must differ, or the distinction is decorative.
    for (const t of ["k", "q", "r", "b", "n", "p"]) expect(chessGlyph("w", t)).not.toBe(chessGlyph("b", t));
  });

  it("names squares from the Bears' back rank down", () => {
    expect(chessSquare(0, 0)).toBe("a8");
    expect(chessSquare(7, 7)).toBe("h1");
    expect(chessSquare(6, 3)).toBe("d2");
  });

  it("counts defenders, not just movers", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k"); b[0][7] = piece("b", "k");
    b[4][4] = piece("w", "p");                 // e4 pawn...
    b[5][3] = piece("w", "p");                 // ...defended by the d3 pawn
    // The defender cannot MOVE onto its friend's square, but it does guard it.
    expect(chessMoves(b, 5, 3).some(m => m.r === 4 && m.c === 4)).toBe(false);
    expect(chessAttacks(b, 4, 4, "w")).toBe(1);
    expect(chessAttacks(b, 4, 4, "b")).toBe(0);
  });

  it("counts a pawn's diagonals as attacks even where it can never move", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k"); b[0][7] = piece("b", "k");
    b[4][4] = piece("w", "p");                 // e4: pushes to e5, attacks d5 and f5
    expect(chessAttacks(b, 3, 4, "w")).toBe(0);   // straight ahead is not an attack
    expect(chessAttacks(b, 3, 3, "w")).toBe(1);
    expect(chessAttacks(b, 3, 5, "w")).toBe(1);
  });

  it("reads the opening position as 16 pieces and 39 material a side", () => {
    const n = chessCount(chessInit());
    expect(n.w).toEqual({ pieces: 16, material: 39 });
    expect(n.b).toEqual({ pieces: 16, material: 39 });
  });

  it("leaves the kings out of material", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k"); b[0][7] = piece("b", "k");
    b[4][4] = piece("w", "q");
    expect(chessCount(b).w).toEqual({ pieces: 2, material: 9 });
    expect(chessCount(b).b).toEqual({ pieces: 1, material: 0 });
  });

  it("scores the opening centre as untouched by either side", () => {
    // The HUD says "dead even" and the coach says OPEN at move one. Both are
    // read off this, so it has to actually be 0-0 — pawns standing NEXT to the
    // centre are not pressure on it.
    expect(chessCentre(chessInit())).toEqual({ w: 0, b: 0 });
  });

  it("scores a centre pawn as pressure", () => {
    const b = chessInit();
    const { next } = chessApply(b, { r: 6, c: 3 }, { r: 4, c: 3 });   // d2-d4
    const cen = chessCentre(next);
    expect(cen.w).toBeGreaterThan(0);
    expect(cen.w).toBeGreaterThan(cen.b);
  });
});

describe("move notation", () => {
  it("writes pawn pushes and captures the way a move list does", () => {
    const b = chessInit();
    expect(chessSan(b, { r: 6, c: 3 }, { r: 4, c: 3 })).toBe("d4");
    const cap = emptyBoard();
    cap[7][4] = piece("w", "k"); cap[0][7] = piece("b", "k");
    cap[4][4] = piece("w", "p"); cap[3][3] = piece("b", "p");
    expect(chessSan(cap, { r: 4, c: 4 }, { r: 3, c: 3 })).toBe("exd5");
  });

  it("marks promotion", () => {
    const b = emptyBoard();
    b[1][0] = piece("w", "p"); b[7][4] = piece("w", "k"); b[0][7] = piece("b", "k");
    expect(chessSan(b, { r: 1, c: 0 }, { r: 0, c: 0 })).toBe("a8=Q");
  });

  it("disambiguates when two of the same piece can reach the square", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k"); b[0][7] = piece("b", "k");
    b[7][1] = piece("w", "n");                 // b1 and...
    b[7][6] = piece("w", "n");                 // ...g1 both reach d2? no — both reach nothing shared
    expect(chessSan(b, { r: 7, c: 1 }, { r: 5, c: 2 })).toBe("Nc3");   // only b1 reaches c3
    // Two rooks on the same rank both reach c1: the file tells them apart. The
    // king sits off the back rank, or it would block the h-rook and there would
    // be nothing to disambiguate.
    const rb = emptyBoard();
    rb[4][4] = piece("w", "k"); rb[0][7] = piece("b", "k");
    rb[7][0] = piece("w", "r"); rb[7][7] = piece("w", "r");
    expect(chessSan(rb, { r: 7, c: 0 }, { r: 7, c: 2 })).toBe("Rac1");
    // Two rooks on the same FILE need the rank instead.
    const fb = emptyBoard();
    fb[4][4] = piece("w", "k"); fb[0][7] = piece("b", "k");
    fb[7][0] = piece("w", "r"); fb[5][0] = piece("w", "r");
    expect(chessSan(fb, { r: 7, c: 0 }, { r: 6, c: 0 })).toBe("R1a2");
  });
});

// ---- three settings that have to play like three opponents ----
describe("house algo", () => {
  // A queen offered a pawn that is defended by another pawn. Taking it wins 1
  // and loses 9. This is the blunder the rail's setting is supposed to govern.
  const poisoned = () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k"); b[0][7] = piece("b", "k");
    b[4][4] = piece("w", "q");                 // white queen e4
    b[3][3] = piece("b", "p");                 // black pawn d5, defended by...
    b[2][2] = piece("b", "p");                 // ...the c6 pawn
    b[6][7] = piece("w", "p");                 // a quiet move is available
    return b;
  };

  it("balanced refuses a capture that loses the piece straight back", () => {
    const b = poisoned();
    for (let i = 0; i < 20; i++) {
      const mv = chessAIMove(b, "w", "balanced");
      expect(mv.to).not.toEqual({ r: 3, c: 3 });
    }
  });

  it("ruthless refuses it too, and looks a whole reply ahead", () => {
    const b = poisoned();
    for (let i = 0; i < 20; i++) {
      const mv = chessAIMove(b, "w", "ruthless");
      expect(mv.to).not.toEqual({ r: 3, c: 3 });
    }
  });

  it("ruthless plays mate when mate is there", () => {
    const b = emptyBoard();
    b[0][7] = piece("b", "k");                 // black king h8, boxed in by its own pawns
    b[1][6] = piece("b", "p"); b[1][7] = piece("b", "p");
    b[7][0] = piece("w", "r");                 // rook a1 — a8 is mate
    b[7][4] = piece("w", "k");
    b[4][4] = piece("w", "q");                 // and a free-looking queen move exists
    const mv = chessAIMove(b, "w", "ruthless");
    expect(mv.to).toEqual({ r: 0, c: 0 });
    expect(gameStatus(chessApply(b, mv.from, mv.to).next, "b")).toBe("checkmate");
  });

  it("passive leaves a defended pawn alone but still takes a free rook", () => {
    const b = poisoned();
    for (let i = 0; i < 20; i++) expect(chessAIMove(b, "w", "passive").to).not.toEqual({ r: 3, c: 3 });
    const free = emptyBoard();
    free[7][4] = piece("w", "k"); free[0][7] = piece("b", "k");
    free[4][4] = piece("w", "q");
    free[4][0] = piece("b", "r");              // undefended rook on the queen's rank
    free[6][7] = piece("w", "p");
    for (let i = 0; i < 20; i++) expect(chessAIMove(free, "w", "passive").to).toEqual({ r: 4, c: 0 });
  });

  it("every setting only ever returns legal moves", () => {
    const has = (moves, r, c) => moves.some(m => m.r === r && m.c === c);
    for (const algo of ["passive", "balanced", "ruthless"]) {
      let board = chessInit(), side = "w";
      for (let ply = 0; ply < 24; ply++) {
        const st = gameStatus(board, side);
        if (st === "checkmate" || st === "stalemate") break;
        const mv = chessAIMove(board, side, algo);
        expect(mv).not.toBeNull();
        expect(has(legalMoves(board, mv.from.r, mv.from.c), mv.to.r, mv.to.c)).toBe(true);
        board = chessApply(board, mv.from, mv.to).next;
        side = side === "w" ? "b" : "w";
      }
    }
  });
});

describe("coach suggestion", () => {
  it("prefers the centre when two moves are equally free and equally safe", () => {
    // The opening d2 pawn. d3 and d4 both win nothing and risk nothing, so on
    // material alone this is a coin flip — the centre is the tiebreak, and it
    // is the reason the reference screen points at d4.
    const b = chessInit();
    expect(chessSuggest(b, { r: 6, c: 3 })).toEqual({ r: 4, c: 3 });
  });

  it("prefers material over the centre when there is material to take", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k"); b[0][7] = piece("b", "k");
    b[6][3] = piece("w", "q");                 // d2 queen: d4 is centre, a5 is a free rook
    b[3][0] = piece("b", "r");
    expect(chessSuggest(b, { r: 6, c: 3 })).toEqual({ r: 3, c: 0 });
  });

  it("will not suggest a square where the piece is taken straight back", () => {
    const b = emptyBoard();
    b[7][4] = piece("w", "k"); b[0][7] = piece("b", "k");
    b[4][4] = piece("w", "q");                 // e4 queen
    b[3][3] = piece("b", "p"); b[2][2] = piece("b", "p");   // d5 pawn, defended by c6
    expect(chessSuggest(b, { r: 4, c: 4 })).not.toEqual({ r: 3, c: 3 });
  });

  it("has nothing to say about an empty square", () => {
    expect(chessSuggest(chessInit(), { r: 4, c: 4 })).toBeNull();
  });
});
