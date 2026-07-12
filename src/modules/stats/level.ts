/** 누적 EXP → 레벨/레벨 내 진행/레벨 구간. threshold(L)=50*(L-1)*L. */
export interface LevelInfo {
  level: number;
  exp: number;
  expForNextLevel: number;
}

const threshold = (level: number): number => 50 * (level - 1) * level;

export function levelFromExp(totalExp: number): LevelInfo {
  const exp = Number.isFinite(totalExp) && totalExp > 0 ? totalExp : 0;
  let level = 1;
  while (threshold(level + 1) <= exp) level++;
  return {
    level,
    exp: exp - threshold(level),
    expForNextLevel: threshold(level + 1) - threshold(level),
  };
}
