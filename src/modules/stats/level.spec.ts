import { levelFromExp } from './level';

describe('levelFromExp', () => {
  it('exp 0 → level 1, 0/100', () => {
    expect(levelFromExp(0)).toEqual({ level: 1, exp: 0, expForNextLevel: 100 });
  });
  it('just below level 2 threshold stays level 1', () => {
    expect(levelFromExp(99)).toEqual({ level: 1, exp: 99, expForNextLevel: 100 });
  });
  it('exactly threshold(2)=100 → level 2, 0/200', () => {
    expect(levelFromExp(100)).toEqual({ level: 2, exp: 0, expForNextLevel: 200 });
  });
  it('mid level 2', () => {
    expect(levelFromExp(299)).toEqual({ level: 2, exp: 199, expForNextLevel: 200 });
  });
  it('threshold(3)=300 → level 3, 0/300', () => {
    expect(levelFromExp(300)).toEqual({ level: 3, exp: 0, expForNextLevel: 300 });
  });
  it('2450 → level 7 (threshold7=2100), 350/700', () => {
    expect(levelFromExp(2450)).toEqual({ level: 7, exp: 350, expForNextLevel: 700 });
  });
  it('negative/NaN-safe → level 1', () => {
    expect(levelFromExp(-5)).toEqual({ level: 1, exp: 0, expForNextLevel: 100 });
  });
});
