import { describe, expect, it } from 'vitest';
import {
  computeErlangC,
  DEFAULT_EV_GRID_PARAMS,
  FEEDER_R_OHM_PER_MI,
  FEEDER_VOLTAGE_KV,
  FEEDER_X_OHM_PER_MI,
  solveEvGrid,
  WORST_CASE_EV_GRID_PARAMS,
} from '../evGridSolver';

describe('evGridSolver', () => {
  it('matches exact analytical M/M/1 and M/M/2 Erlang-C identities', () => {
    // M/M/1: lambda=3, mu=5 -> rho=0.6, C(1,0.6)=0.6, Wq = rho / (mu*(1-rho)) = 0.3 hr
    const mm1 = computeErlangC(3, 5, 1);
    expect(mm1.rho).toBeCloseTo(0.6, 8);
    expect(mm1.probWait).toBeCloseTo(0.6, 8);
    expect(mm1.meanWaitHr).toBeCloseTo(0.3, 8);

    // M/M/2: lambda=4, mu=4 -> a=1, rho=0.5, C(2,1) = a^2 / (2+a) = 1/3, Wq = (1/3)/(8-4) = 1/12 hr
    const mm2 = computeErlangC(4, 4, 2);
    expect(mm2.rho).toBeCloseTo(0.5, 8);
    expect(mm2.probWait).toBeCloseTo(1 / 3, 8);
    expect(mm2.meanWaitHr).toBeCloseTo(1 / 12, 8);
  });

  it('flags unstable queue when arrival rate meets or exceeds total service capacity', () => {
    const unstable = computeErlangC(12, 3, 4); // rho = 1.0
    expect(unstable.unstable).toBe(true);
    expect(unstable.meanWaitHr).toBe(Infinity);

    const res = solveEvGrid({
      ...DEFAULT_EV_GRID_PARAMS,
      peakTrafficVph: 4000,
      evPenetrationPct: 60,
      chargerPorts: 4,
      chargerPowerKw: 150,
    });
    expect(res.isQueueUnstable).toBe(true);
    expect(res.waitTimePass).toBe(false);
    expect(res.overallPass).toBe(false);
  });

  it('computes 3-phase feeder voltage drop matching analytical formula', () => {
    const res = solveEvGrid(DEFAULT_EV_GRID_PARAMS);
    const expectedDropPct =
      ((res.coincidentLoadKw * FEEDER_R_OHM_PER_MI +
        res.reactivePowerKvar * FEEDER_X_OHM_PER_MI) /
        (10 * FEEDER_VOLTAGE_KV * FEEDER_VOLTAGE_KV)) *
      DEFAULT_EV_GRID_PARAMS.feederDistanceMi;
    expect(res.feederVoltageDropPct).toBeCloseTo(expectedDropPct, 8);

    const doubleDist = solveEvGrid({
      ...DEFAULT_EV_GRID_PARAMS,
      feederDistanceMi: DEFAULT_EV_GRID_PARAMS.feederDistanceMi * 2,
    });
    expect(doubleDist.feederVoltageDropPct).toBeCloseTo(res.feederVoltageDropPct * 2, 8);
  });

  it('passes default scenario and fails worst-case sweep', () => {
    const def = solveEvGrid(DEFAULT_EV_GRID_PARAMS);
    expect(def.overallPass).toBe(true);
    expect(def.transformerLoadingPct).toBeLessThanOrEqual(100);
    expect(def.meanWaitTimeMin).toBeLessThanOrEqual(10);
    expect(def.profile24h).toHaveLength(24);

    const worst = solveEvGrid(WORST_CASE_EV_GRID_PARAMS);
    expect(worst.overallPass).toBe(false);
  });
});
