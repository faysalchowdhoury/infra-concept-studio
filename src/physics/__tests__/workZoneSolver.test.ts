import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORK_ZONE_PARAMS,
  solveWorkZone,
  WORST_CASE_WORK_ZONE_PARAMS,
} from '../workZoneSolver';

describe('workZoneSolver', () => {
  it('computes exact HCM heavy vehicle factor, capacity, and v/c ratio', () => {
    const res = solveWorkZone({
      approachVolumeVph: 600,
      heavyVehiclePct: 20,
      baseLanes: 2,
      cycleLengthS: 100,
      effectiveGreenRatio: 0.5,
      workZoneStartM: 250,
    });
    // f_HV = 1 / (1 + 0.20 * (2.0 - 1)) = 1 / 1.2
    expect(res.heavyVehicleFactor).toBeCloseTo(1 / 1.2, 6);
    expect(res.openLanes).toBe(1);
    expect(res.workZoneReductionFactor).toBe(0.85);
    // s = 1900 * 1 * (1/1.2) * 0.85 = 1345.8333, c = s * 0.5 = 672.9167
    const expectedCap = 1900 * 1 * (1 / 1.2) * 0.85 * 0.5;
    expect(res.capacityVph).toBeCloseTo(expectedCap, 4);
    expect(res.vcRatio).toBeCloseTo(600 / expectedCap, 5);
  });

  it('computes exact uniform delay d1 when unsaturated', () => {
    const res = solveWorkZone({
      approachVolumeVph: 500,
      heavyVehiclePct: 0,
      baseLanes: 3,
      cycleLengthS: 100,
      effectiveGreenRatio: 0.5,
      workZoneStartM: 250,
    });
    // s = 1900 * 2 * 1.0 * 0.90 = 3420, c = 1710, X = 500/1710 = 0.292398
    const X = 500 / 1710;
    const expectedD1 = (0.5 * 100 * Math.pow(0.5, 2)) / (1 - X * 0.5);
    expect(res.uniformDelayS).toBeCloseTo(expectedD1, 5);
    expect(res.losGrade).toBe('B');
    expect(res.overallPass).toBe(true);
  });

  it('triggers spillback fail when barrier is dragged closer than queue length', () => {
    const farBarrier = solveWorkZone({
      ...DEFAULT_WORK_ZONE_PARAMS,
      workZoneStartM: 300,
    });
    expect(farBarrier.spillbackIntoUpstreamA).toBe(false);

    const closeBarrier = solveWorkZone({
      ...DEFAULT_WORK_ZONE_PARAMS,
      workZoneStartM: Math.max(20, farBarrier.queueLengthM - 15),
    });
    expect(closeBarrier.spillbackIntoUpstreamA).toBe(true);
    expect(closeBarrier.spillbackPass).toBe(false);
    expect(closeBarrier.overallPass).toBe(false);
  });

  it('passes default scenario and fails worst-case sweep', () => {
    expect(solveWorkZone(DEFAULT_WORK_ZONE_PARAMS).overallPass).toBe(true);
    const worst = solveWorkZone(WORST_CASE_WORK_ZONE_PARAMS);
    expect(worst.overallPass).toBe(false);
    expect(worst.losPass).toBe(false);
  });
});
