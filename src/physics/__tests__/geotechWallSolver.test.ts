import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GEOTECH_PARAMS,
  solveGeotechWall,
  WATER_UNIT_WEIGHT_KN_M3,
  WORST_CASE_GEOTECH_PARAMS,
} from '../geotechWallSolver';

describe('geotechWallSolver', () => {
  it('computes exact Rankine Ka and dry active earth thrust', () => {
    const H = 6.0;
    const gamma = 18.0;
    const res = solveGeotechWall({
      wallHeightM: H,
      baseWidthM: 4.5,
      frictionAngleDeg: 30,
      soilUnitWeightKnM3: gamma,
      allowableBearingKpa: 300,
      waterTableHeightM: 0,
      surchargeKpa: 0,
      surchargeOffsetM: 0,
    });
    // Ka = tan^2(45 - 15) = tan^2(30) = 1/3
    expect(res.ka).toBeCloseTo(1 / 3, 6);
    // Pa = 0.5 * (1/3) * 18 * 36 = 108 kN/m
    expect(res.drySoilThrustKnM).toBeCloseTo(108, 5);
    expect(res.totalHorizontalForceKnM).toBeCloseTo(108, 5);
    // Mo = 108 * (6 / 3) = 216 kN-m/m
    expect(res.overturningMomentKnM).toBeCloseTo(216, 5);
  });

  it('adds hydrostatic pressure below water table and reduces FoS', () => {
    const dry = solveGeotechWall({
      ...DEFAULT_GEOTECH_PARAMS,
      waterTableHeightM: 0,
    });
    const wet = solveGeotechWall({
      ...DEFAULT_GEOTECH_PARAMS,
      waterTableHeightM: 3.0,
    });

    const expectedHwThrust = 0.5 * WATER_UNIT_WEIGHT_KN_M3 * 3.0 * 3.0;
    expect(wet.hydrostaticThrustKnM).toBeCloseTo(expectedHwThrust, 5);
    expect(wet.totalHorizontalForceKnM).toBeGreaterThan(dry.totalHorizontalForceKnM);
    expect(wet.fosOverturning).toBeLessThan(dry.fosOverturning);
    expect(wet.fosSliding).toBeLessThan(dry.fosSliding);
  });

  it('verifies middle-third resultant and trapezoidal bearing pressure', () => {
    const res = solveGeotechWall(DEFAULT_GEOTECH_PARAMS);
    const B = res.geometry.baseWidthM;
    expect(res.inMiddleThird).toBe(true);
    expect(Math.abs(res.eccentricityM)).toBeLessThanOrEqual(B / 6);

    const expectedQmax =
      (res.totalVerticalForceKnM / B) *
      (1 + (6 * Math.abs(res.eccentricityM)) / B);
    expect(res.qMaxKpa).toBeCloseTo(expectedQmax, 5);
    expect(res.overallPass).toBe(true);
  });

  it('fails stability checks under worst-case sweep', () => {
    const worst = solveGeotechWall(WORST_CASE_GEOTECH_PARAMS);
    expect(worst.overallPass).toBe(false);
    expect(worst.overturningPass && worst.slidingPass && worst.bearingPass).toBe(false);
  });
});
