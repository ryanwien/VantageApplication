import { describe, it, expect } from "vitest";
import {
  chessInit, chessMoves, legalMoves, chessApply, inCheck, gameStatus, chessAIMove,
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
