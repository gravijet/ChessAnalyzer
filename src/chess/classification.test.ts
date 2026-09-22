import { describe, expect, it } from 'vitest'
import { accuracyFromWinPercentLoss, classifyMove, winPercentForWhite } from './classification'
import type { EngineLine } from '../types'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function line(move: string, san: string, cp: number, pv: string[] = [move]): EngineLine {
  return { move, san, eval: { type: 'cp', value: cp }, pv }
}

describe('winPercentForWhite', () => {
  it('is 50% at eval 0', () => {
    expect(winPercentForWhite({ type: 'cp', value: 0 })).toBeCloseTo(50, 5)
  })
  it('is monotonically increasing with cp', () => {
    const low = winPercentForWhite({ type: 'cp', value: -200 })
    const high = winPercentForWhite({ type: 'cp', value: 200 })
    expect(high).toBeGreaterThan(50)
    expect(low).toBeLessThan(50)
  })
  it('treats a White mate as 100% and a Black mate as 0%', () => {
    expect(winPercentForWhite({ type: 'mate', value: 3 })).toBe(100)
    expect(winPercentForWhite({ type: 'mate', value: -3 })).toBe(0)
  })
})

describe('accuracyFromWinPercentLoss', () => {
  it('is 100 at zero loss and decreases with loss, clamped to [0,100]', () => {
    expect(accuracyFromWinPercentLoss(0)).toBeCloseTo(100, 0)
    expect(accuracyFromWinPercentLoss(50)).toBeLessThan(accuracyFromWinPercentLoss(10))
    expect(accuracyFromWinPercentLoss(1000)).toBeGreaterThanOrEqual(0)
  })
})

describe('classifyMove', () => {
  it('marks the engine top choice as best', () => {
    const lines = [line('e2e4', 'e4', 20), line('d2d4', 'd4', 15), line('g1f3', 'Nf3', 10)]
    const result = classifyMove(
      {
        ply: 0,
        color: 'w',
        fenBefore: START_FEN,
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        san: 'e4',
        uci: 'e2e4',
        lines,
        evalAfterPlayed: lines[0].eval,
        legalMoveCount: 20,
      },
      null,
    )
    expect(result.classification).toBe('best')
    expect(result.winPercentLoss).toBeCloseTo(0, 5)
  })

  it('marks a large win% drop as a blunder', () => {
    const lines = [line('e2e4', 'e4', 20), line('d2d4', 'd4', 15)]
    const result = classifyMove(
      {
        ply: 0,
        color: 'w',
        fenBefore: START_FEN,
        fenAfter: START_FEN,
        san: 'g4',
        uci: 'g2g4', // not one of the searched lines -> not "best"
        lines,
        evalAfterPlayed: { type: 'cp', value: -600 }, // huge swing away from the mover
        legalMoveCount: 20,
      },
      null,
    )
    expect(['blunder', 'miss']).toContain(result.classification)
  })

  it('classifies a position with a single legal move as forced', () => {
    const lines = [line('e2e4', 'e4', 20)]
    const result = classifyMove(
      {
        ply: 10,
        color: 'w',
        fenBefore: START_FEN,
        fenAfter: START_FEN,
        san: 'e4',
        uci: 'e2e4',
        lines,
        evalAfterPlayed: lines[0].eval,
        legalMoveCount: 1,
      },
      null,
    )
    expect(result.classification).toBe('forced')
  })

  it('does not call a moderate ~18% win-loss a mistake (recalibrated thresholds)', () => {
    const lines = [line('e2e4', 'e4', 200)]
    const result = classifyMove(
      {
        ply: 20,
        color: 'w',
        fenBefore: START_FEN,
        fenAfter: START_FEN,
        san: 'd4',
        uci: 'd2d4', // not the searched line -> not "best"
        lines,
        evalAfterPlayed: { type: 'cp', value: 0 },
        legalMoveCount: 20,
      },
      null,
    )
    expect(result.classification).toBe('inaccuracy')
  })

  it('flags a move that offers a piece for capture on the opponent\'s very next reply as brilliant', () => {
    // White rook walks onto a square a black pawn can take (b3xa2) - the
    // material loss only happens one ply later, not on this move itself.
    const fenBefore = '7k/8/8/8/8/1p6/8/R3K3 w - - 0 1'
    const lines = [line('a1a2', 'Ra2', 0, ['a1a2', 'b3a2'])]
    const result = classifyMove(
      {
        ply: 20,
        color: 'w',
        fenBefore,
        fenAfter: fenBefore,
        san: 'Ra2',
        uci: 'a1a2',
        lines,
        evalAfterPlayed: lines[0].eval,
        legalMoveCount: 20,
      },
      null,
    )
    expect(result.classification).toBe('brilliant')
    expect(result.brilliantNote).toContain('einen Turm')
  })

  it('does not call a piece sacrifice "brilliant" when the position is only barely-not-lost afterward', () => {
    // Same rook sacrifice pattern as above, but the resulting eval (~30% win)
    // is well below the "clearly still good" floor — this is the exact
    // regression an earlier, looser win% floor (25%) let through: a move
    // that's the engine's own top choice yet clearly not good gets flagged
    // Brilliant just because material moves around along the way.
    const fenBefore = '7k/8/8/8/8/1p6/8/R3K3 w - - 0 1'
    const lines = [line('a1a2', 'Ra2', -230, ['a1a2', 'b3a2'])]
    const result = classifyMove(
      {
        ply: 20,
        color: 'w',
        fenBefore,
        fenAfter: fenBefore,
        san: 'Ra2',
        uci: 'a1a2',
        lines,
        evalAfterPlayed: lines[0].eval,
        legalMoveCount: 20,
      },
      null,
    )
    expect(result.classification).not.toBe('brilliant')
  })

  it('does not call an ordinary trade "brilliant" just because material dips mid-sequence', () => {
    // White rook a1 "offers" itself on a2, Black's rook a3 takes it, then
    // White's bishop b1 recaptures on a2 - a plain rook-for-rook trade that
    // nets back to material equality. Peak-deficit tracking (the earlier,
    // buggy version of the material-sacrifice detector) would have reported
    // this as "sacrificed 5" because it only looked at the deficit
    // immediately after Black's capture, never noticing the mover
    // recaptures two plies later. This is the exact bug reported by the
    // user: "Ein Trade ist kein brillianter Zug... alle brilliante Züge
    // hier sind Trades."
    const fenBefore = '7k/8/8/8/8/r7/8/RB2K3 w - - 0 1'
    const lines = [line('a1a2', 'Ra2', 0, ['a1a2', 'a3a2', 'b1a2'])]
    const result = classifyMove(
      {
        ply: 20,
        color: 'w',
        fenBefore,
        fenAfter: fenBefore,
        san: 'Ra2',
        uci: 'a1a2',
        lines,
        evalAfterPlayed: lines[0].eval,
        legalMoveCount: 20,
      },
      null,
    )
    expect(result.classification).not.toBe('brilliant')
  })

  it('does not call a trade "brilliant" even when the recapture is 8+ plies later (long trades must fully resolve)', () => {
    // Same rook-for-bishop-recapture trade as above, but this time padded
    // out with quiet king shuffling so the actual recapture (White's
    // bishop taking on a2) doesn't happen until ply index 8 - past the
    // 6-ply window an earlier fix used. That version was itself still too
    // shallow: user feedback was explicit that real trades/combinations
    // regularly run 10+ moves before resolving ("es gibt ja auch trades
    // die 10 oder mehr züge lang gehen"). With only a 6-ply lookahead this
    // exact sequence would still have been misclassified Brilliant, since
    // the window would end before the recapture and see a rook down with
    // nothing recovering it yet.
    const fenBefore = '7k/8/8/8/8/r7/8/RB2K3 w - - 0 1'
    const pv = ['a1a2', 'a3a2', 'e1d1', 'h8g8', 'd1e1', 'g8h8', 'e1d1', 'h8g8', 'b1a2', 'g8h8']
    const lines = [line('a1a2', 'Ra2', 0, pv)]
    const result = classifyMove(
      {
        ply: 20,
        color: 'w',
        fenBefore,
        fenAfter: fenBefore,
        san: 'Ra2',
        uci: 'a1a2',
        lines,
        evalAfterPlayed: lines[0].eval,
        legalMoveCount: 20,
      },
      null,
    )
    expect(result.classification).not.toBe('brilliant')
  })

  it('flags a forced mate (not mate-in-1) as brilliant even with no material sacrifice at all', () => {
    // Brilliant doesn't require losing material - chess.com also awards it
    // for a hard-to-find forced mate (user feedback: "die brillianten
    // heißen nicht unbedingt dass man was verliert sondern vielleicht auch
    // gewinnt. oder schachmatt macht.").
    const lines: EngineLine[] = [{ move: 'e2e4', san: 'e4', eval: { type: 'mate', value: 2 }, pv: ['e2e4'] }]
    const result = classifyMove(
      {
        ply: 0,
        color: 'w',
        fenBefore: START_FEN,
        fenAfter: START_FEN,
        san: 'e4',
        uci: 'e2e4',
        lines,
        evalAfterPlayed: lines[0].eval,
        legalMoveCount: 20,
      },
      null,
    )
    expect(result.classification).toBe('brilliant')
    expect(result.brilliantNote).toContain('Matt in 2')
  })

  it('flags a delayed, non-obvious material win as brilliant, not just outright sacrifices', () => {
    // White rook hops to d8 (no capture at all on the judged move itself),
    // Black shuffles, then the rook swings along the 8th rank to win
    // Black's rook two plies later - a real material WIN via a
    // non-immediate combination, not a sacrifice and not an obvious
    // one-move capture either.
    const fenBefore = 'r6k/8/8/8/3R4/8/8/4K3 w - - 0 1'
    const pv = ['d4d8', 'h8h7', 'd8a8']
    const lines: EngineLine[] = [{ move: 'd4d8', san: 'Rd8', eval: { type: 'cp', value: 500 }, pv }]
    const result = classifyMove(
      {
        ply: 20,
        color: 'w',
        fenBefore,
        fenAfter: fenBefore,
        san: 'Rd8',
        uci: 'd4d8',
        lines,
        evalAfterPlayed: lines[0].eval,
        legalMoveCount: 20,
      },
      null,
    )
    expect(result.classification).toBe('brilliant')
    expect(result.brilliantNote).toContain('einen Turm')
  })

  it('respects an opening-book match by tagging early plies as book', () => {
    const lines = [line('e2e4', 'e4', 20)]
    const result = classifyMove(
      {
        ply: 0,
        color: 'w',
        fenBefore: START_FEN,
        fenAfter: START_FEN,
        san: 'e4',
        uci: 'e2e4',
        lines,
        evalAfterPlayed: lines[0].eval,
        legalMoveCount: 20,
      },
      { eco: 'C20', name: 'King’s Pawn Game', plyCount: 4 },
    )
    expect(result.classification).toBe('book')
  })
})
