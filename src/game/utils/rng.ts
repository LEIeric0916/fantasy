export interface RngResult<T> { value: T; seed: number }

function next(seed: number): RngResult<number> {
  const nextSeed = (seed * 1664525 + 1013904223) >>> 0;
  return { value: nextSeed / 0x1_0000_0000, seed: nextSeed };
}

export function shuffleSeeded<T>(items: readonly T[], initialSeed: number): RngResult<T[]> {
  const value = [...items];
  let seed = initialSeed >>> 0;
  for (let index = value.length - 1; index > 0; index -= 1) {
    const roll = next(seed);
    seed = roll.seed;
    const target = Math.floor(roll.value * (index + 1));
    [value[index], value[target]] = [value[target], value[index]];
  }
  return { value, seed };
}
