import { describe, expect, it } from 'vitest';
import {
  DEFAULT_V2X_PARAMS,
  DEFAULT_VEHICLE_ATTACKS,
  GRAVITY_MS2,
  solveV2xFdi,
  WORST_CASE_V2X_PARAMS,
} from '../v2xFdiSolver';

describe('v2xFdiSolver', () => {
  it('enforces exact friction-circle lateral and longitudinal kinematic bounds', () => {
    const res = solveV2xFdi({ ...DEFAULT_V2X_PARAMS, roadFrictionMu: 0.4 });
    expect(res.maxLatAccelBoundMs2).toBeCloseTo(0.4 * GRAVITY_MS2, 6);
    expect(res.maxLongAccelBoundMs2).toBeCloseTo(0.8 * GRAVITY_MS2, 6);
  });

  it('quarantines spoofed BSM in < 50 ms with zero false positives at 10 Hz', () => {
    const res = solveV2xFdi(DEFAULT_V2X_PARAMS);
    expect(res.activeAttackCount).toBe(1);
    expect(res.falsePositives).toBe(0);
    expect(res.missedDetections).toBe(0);
    expect(res.maxDetectionLatencyMs).toBeLessThan(50);
    expect(res.protectedPass).toBe(true);

    const attacked = res.vehicles.find((v) => v.id === 'V04')!;
    expect(attacked.quarantined).toBe(true);
    expect(attacked.positionErrorM).toBeCloseTo(Math.hypot(15, 2.5), 4);
  });

  it('detects unphysical jerk/accel and ghost vehicle attacks', () => {
    const res = solveV2xFdi({
      ...DEFAULT_V2X_PARAMS,
      vehicleAttacks: {
        ...DEFAULT_VEHICLE_ATTACKS,
        V02: 'unphysical_accel',
        V04: 'none',
        V08: 'ghost_vehicle',
      },
    });
    expect(res.activeAttackCount).toBe(2);
    expect(res.falsePositives).toBe(0);
    expect(res.missedDetections).toBe(0);
    expect(res.protectedPass).toBe(true);
  });

  it('fails latency compliance at low BSM broadcast rate and fails worst-case sweep', () => {
    const lowRate = solveV2xFdi({
      ...DEFAULT_V2X_PARAMS,
      bsmRateHz: 1,
    });
    expect(lowRate.maxDetectionLatencyMs).toBeGreaterThan(50);
    expect(lowRate.protectedPass).toBe(false);

    const worst = solveV2xFdi(WORST_CASE_V2X_PARAMS);
    expect(worst.protectedPass).toBe(false);
    expect(worst.falsePositives).toBeGreaterThan(0);
  });

  it('remains protected with zero false positives when no attacks are active', () => {
    const cleanAttacks = Object.fromEntries(
      Object.keys(DEFAULT_VEHICLE_ATTACKS).map((k) => [k, 'none' as const])
    );
    const res = solveV2xFdi({
      ...DEFAULT_V2X_PARAMS,
      vehicleAttacks: cleanAttacks,
    });
    expect(res.activeAttackCount).toBe(0);
    expect(res.falsePositives).toBe(0);
    expect(res.protectedPass).toBe(true);
  });
});
