import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LuckyDrawPrize } from "@nevo/shared-types";
import { selectWeightedLuckyDrawPrize, toLuckyDrawWeight } from "./lucky-draw.util";

const prizes: LuckyDrawPrize[] = [
  {
    id: "a",
    label: "A",
    chance: 10,
    rewardAmount: 0,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "b",
    label: "B",
    chance: 20,
    rewardAmount: 0,
    rewardAsset: "USDT_TRC20"
  }
];

describe("selectWeightedLuckyDrawPrize", () => {
  it("maps roll boundaries to the correct prize", () => {
    const firstWeight = toLuckyDrawWeight(10);
    const first = selectWeightedLuckyDrawPrize(prizes, 1);
    const edge = selectWeightedLuckyDrawPrize(prizes, firstWeight);
    const second = selectWeightedLuckyDrawPrize(prizes, firstWeight + 1);

    assert.equal(first.prize.id, "a");
    assert.equal(edge.prize.id, "a");
    assert.equal(second.prize.id, "b");
    assert.equal(second.rollMax, toLuckyDrawWeight(10) + toLuckyDrawWeight(20));
  });

  it("ignores zero-chance prizes", () => {
    const selected = selectWeightedLuckyDrawPrize([
      {
        ...prizes[0],
        chance: 0
      },
      prizes[1]
    ], 1);

    assert.equal(selected.prize.id, "b");
    assert.equal(selected.prizeIndex, 1);
  });
});
