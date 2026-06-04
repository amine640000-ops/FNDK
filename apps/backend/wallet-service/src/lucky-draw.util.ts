import { randomInt } from "crypto";
import type { LuckyDrawPrize } from "@nevo/shared-types";

export type LuckyDrawWeightSnapshot = Array<{
  id: string;
  label: string;
  weight: number;
  start: number;
  end: number;
}>;

export type WeightedLuckyDrawSelection = {
  prize: LuckyDrawPrize;
  prizeIndex: number;
  rollValue: number;
  rollMax: number;
  weightSnapshot: LuckyDrawWeightSnapshot;
};

const chanceScale = 10_000;

export const toLuckyDrawWeight = (chance: number) => {
  if (!Number.isFinite(chance) || chance <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(chance * chanceScale));
};

export const selectWeightedLuckyDrawPrize = (
  prizes: LuckyDrawPrize[],
  rollOverride?: number
): WeightedLuckyDrawSelection => {
  const weightedPrizes = prizes
    .map((prize, prizeIndex) => ({
      prize,
      prizeIndex,
      weight: toLuckyDrawWeight(prize.chance)
    }))
    .filter((entry) => entry.weight > 0);

  if (!weightedPrizes.length) {
    throw new Error("Lucky Draw has no eligible prizes");
  }

  const rollMax = weightedPrizes.reduce((sum, entry) => sum + entry.weight, 0);
  const rollValue = rollOverride ?? randomInt(1, rollMax + 1);
  if (!Number.isInteger(rollValue) || rollValue < 1 || rollValue > rollMax) {
    throw new Error(`Lucky Draw roll must be between 1 and ${rollMax}`);
  }

  let cursor = 0;
  const weightSnapshot: LuckyDrawWeightSnapshot = weightedPrizes.map((entry) => {
    const start = cursor + 1;
    cursor += entry.weight;
    return {
      id: entry.prize.id,
      label: entry.prize.label,
      weight: entry.weight,
      start,
      end: cursor
    };
  });

  const selectedIndex = weightSnapshot.findIndex((entry) => rollValue >= entry.start && rollValue <= entry.end);
  const selected = weightedPrizes[selectedIndex >= 0 ? selectedIndex : weightedPrizes.length - 1];

  return {
    prize: selected.prize,
    prizeIndex: selected.prizeIndex,
    rollValue,
    rollMax,
    weightSnapshot
  };
};
