export interface EvGridParams {
  evPenetrationPct: number; // 5 - 60 %
  chargerPorts: number; // 4 - 32 ports
  chargerPowerKw: 150 | 250 | 350; // kW
  peakTrafficVph: number; // 500 - 4000 vph
  transformerKva: number; // 1000 - 5000 kVA
  emissionsFactorGCo2Kwh: number; // 150 - 750 g CO2/kWh
  stationMilepostMi: number; // 0 - 50 mi along corridor (substation at Mile 25)
  feederDistanceMi: number; // 0.5 - 25 mi (synced with |stationMilepostMi - 25|)
}

export interface HourlyProfilePoint {
  hour: number;
  label: string;
  trafficFactor: number;
  arrivalRateVehHr: number;
  loadKw: number;
  transformerLoadingPct: number;
  co2Kg: number;
}

export interface EvGridResult {
  arrivalRateVehHr: number;
  serviceRatePerPortVehHr: number;
  meanSessionDurationMin: number;
  offeredLoadErlangs: number;
  utilizationRho: number;
  erlangCProbWait: number;
  isQueueUnstable: boolean;
  meanWaitTimeMin: number;
  expectedActivePorts: number;
  diversityFactor: number;
  coincidentLoadKw: number;
  apparentPowerKva: number;
  reactivePowerKvar: number;
  transformerLoadingPct: number;
  feederVoltageDropPct: number;
  hourlyCo2Kg: number;
  dailyCo2Tons: number;
  profile24h: HourlyProfilePoint[];
  transformerPass: boolean;
  waitTimePass: boolean;
  overallPass: boolean;
  transformerMarginPct: number;
  waitTimeMarginMin: number;
}

export const DEFAULT_EV_GRID_PARAMS: EvGridParams = {
  evPenetrationPct: 25,
  chargerPorts: 16,
  chargerPowerKw: 250,
  peakTrafficVph: 1800,
  transformerKva: 3000,
  emissionsFactorGCo2Kwh: 380,
  stationMilepostMi: 31,
  feederDistanceMi: 6,
};

export const WORST_CASE_EV_GRID_PARAMS: EvGridParams = {
  evPenetrationPct: 55,
  chargerPorts: 8,
  chargerPowerKw: 350,
  peakTrafficVph: 3600,
  transformerKva: 1500,
  emissionsFactorGCo2Kwh: 700,
  stationMilepostMi: 48,
  feederDistanceMi: 23,
};

// Corridor highway DCFC capture rate (fraction of passing EVs stopping at this plaza)
export const EV_CAPTURE_RATE = 0.08;
// Average en-route charging energy delivered per session (kWh)
export const MEAN_SESSION_ENERGY_KWH = 52;
// Battery taper effective charging power ratio
export const TAPER_POWER_RATIO = 0.72;
// Plug-in/auth/disconnect overhead (hr) = 3 minutes
export const SESSION_OVERHEAD_HR = 0.05;
// Rectifier conversion efficiency and power factor
export const CHARGER_EFFICIENCY = 0.94;
export const CHARGER_POWER_FACTOR = 0.98;
// 12.47 kV 3-phase MV distribution feeder (4/0 ACSR Penguin)
export const FEEDER_VOLTAGE_KV = 12.47;
export const FEEDER_R_OHM_PER_MI = 0.592;
export const FEEDER_X_OHM_PER_MI = 0.71;
export const SUBSTATION_MILEPOST_MI = 25;

// Normalized 24-hour interstate highway diurnal traffic profile (peak = 1.00 at 17:00)
export const DIURNAL_FACTORS: readonly number[] = [
  0.18, 0.14, 0.12, 0.13, 0.19, 0.34,
  0.58, 0.79, 0.84, 0.76, 0.74, 0.78,
  0.82, 0.80, 0.83, 0.90, 0.97, 1.00,
  0.89, 0.73, 0.57, 0.44, 0.32, 0.23,
];

/**
 * Numerically stable Erlang-C delay probability C(c, a) and wait time Wq.
 * Uses iterative term normalization so c up to 64+ never overflows IEEE-754 floats.
 */
export function computeErlangC(
  arrivalRate: number,
  serviceRatePerServer: number,
  servers: number
): {
  rho: number;
  offeredErlangs: number;
  probWait: number;
  meanWaitHr: number;
  unstable: boolean;
} {
  const c = Math.max(1, Math.round(servers));
  const a = arrivalRate / serviceRatePerServer;
  const rho = a / c;

  if (arrivalRate <= 0) {
    return { rho: 0, offeredErlangs: 0, probWait: 0, meanWaitHr: 0, unstable: false };
  }

  if (rho >= 1) {
    return {
      rho,
      offeredErlangs: a,
      probWait: 1,
      meanWaitHr: Infinity,
      unstable: true,
    };
  }

  // Sum_{k=0}^{c-1} (a^k / k!) and (a^c / c!) computed iteratively
  let sumSeries = 1.0;
  let term = 1.0;
  for (let k = 1; k < c; k++) {
    term = (term * a) / k;
    sumSeries += term;
  }
  const termC = (term * a) / c;
  const tailTerm = termC / (1 - rho);
  const probWait = tailTerm / (sumSeries + tailTerm);
  const meanWaitHr = probWait / (c * serviceRatePerServer - arrivalRate);

  return {
    rho,
    offeredErlangs: a,
    probWait,
    meanWaitHr,
    unstable: false,
  };
}

function computeDemandSnapshot(
  trafficVph: number,
  params: EvGridParams
): {
  arrivalRateVehHr: number;
  serviceRatePerPortVehHr: number;
  meanSessionDurationMin: number;
  erlang: ReturnType<typeof computeErlangC>;
  expectedActivePorts: number;
  diversityFactor: number;
  coincidentLoadKw: number;
  apparentPowerKva: number;
  reactivePowerKvar: number;
  transformerLoadingPct: number;
  co2KgPerHr: number;
} {
  const arrivalRateVehHr =
    trafficVph * (params.evPenetrationPct / 100) * EV_CAPTURE_RATE;

  const effectiveChargingKw = params.chargerPowerKw * TAPER_POWER_RATIO;
  const meanSessionDurationHr =
    MEAN_SESSION_ENERGY_KWH / effectiveChargingKw + SESSION_OVERHEAD_HR;
  const meanSessionDurationMin = meanSessionDurationHr * 60;
  const serviceRatePerPortVehHr = 1 / meanSessionDurationHr;

  const erlang = computeErlangC(
    arrivalRateVehHr,
    serviceRatePerPortVehHr,
    params.chargerPorts
  );

  const expectedActivePorts = Math.min(params.chargerPorts, erlang.offeredErlangs);
  const diversityFactor =
    expectedActivePorts <= 0
      ? 1
      : 0.68 + 0.32 / Math.sqrt(Math.max(1, expectedActivePorts));

  const coincidentLoadKw =
    (expectedActivePorts * params.chargerPowerKw * diversityFactor) /
    CHARGER_EFFICIENCY;
  const apparentPowerKva = coincidentLoadKw / CHARGER_POWER_FACTOR;
  const reactivePowerKvar = Math.sqrt(
    Math.max(0, apparentPowerKva * apparentPowerKva - coincidentLoadKw * coincidentLoadKw)
  );
  const transformerLoadingPct = (apparentPowerKva / params.transformerKva) * 100;
  const co2KgPerHr = coincidentLoadKw * (params.emissionsFactorGCo2Kwh / 1000);

  return {
    arrivalRateVehHr,
    serviceRatePerPortVehHr,
    meanSessionDurationMin,
    erlang,
    expectedActivePorts,
    diversityFactor,
    coincidentLoadKw,
    apparentPowerKva,
    reactivePowerKvar,
    transformerLoadingPct,
    co2KgPerHr,
  };
}

export function solveEvGrid(params: EvGridParams): EvGridResult {
  const peak = computeDemandSnapshot(params.peakTrafficVph, params);

  // 3-phase MV distribution feeder voltage drop: dV% = (P*R + Q*X) / (10 * V_LL^2) * L
  const feederVoltageDropPct =
    ((peak.coincidentLoadKw * FEEDER_R_OHM_PER_MI +
      peak.reactivePowerKvar * FEEDER_X_OHM_PER_MI) /
      (10 * FEEDER_VOLTAGE_KV * FEEDER_VOLTAGE_KV)) *
    params.feederDistanceMi;

  const profile24h: HourlyProfilePoint[] = DIURNAL_FACTORS.map((factor, hour) => {
    const snap = computeDemandSnapshot(params.peakTrafficVph * factor, params);
    return {
      hour,
      label: `${hour.toString().padStart(2, '0')}:00`,
      trafficFactor: factor,
      arrivalRateVehHr: snap.arrivalRateVehHr,
      loadKw: snap.coincidentLoadKw,
      transformerLoadingPct: snap.transformerLoadingPct,
      co2Kg: snap.co2KgPerHr,
    };
  });

  const dailyCo2Tons =
    profile24h.reduce((acc, p) => acc + p.co2Kg, 0) / 1000;

  const meanWaitTimeMin = peak.erlang.unstable
    ? Infinity
    : peak.erlang.meanWaitHr * 60;

  const transformerPass = peak.transformerLoadingPct <= 100;
  const waitTimePass = !peak.erlang.unstable && meanWaitTimeMin <= 10;
  const overallPass = transformerPass && waitTimePass;

  return {
    arrivalRateVehHr: peak.arrivalRateVehHr,
    serviceRatePerPortVehHr: peak.serviceRatePerPortVehHr,
    meanSessionDurationMin: peak.meanSessionDurationMin,
    offeredLoadErlangs: peak.erlang.offeredErlangs,
    utilizationRho: peak.erlang.rho,
    erlangCProbWait: peak.erlang.probWait,
    isQueueUnstable: peak.erlang.unstable,
    meanWaitTimeMin,
    expectedActivePorts: peak.expectedActivePorts,
    diversityFactor: peak.diversityFactor,
    coincidentLoadKw: peak.coincidentLoadKw,
    apparentPowerKva: peak.apparentPowerKva,
    reactivePowerKvar: peak.reactivePowerKvar,
    transformerLoadingPct: peak.transformerLoadingPct,
    feederVoltageDropPct,
    hourlyCo2Kg: peak.co2KgPerHr,
    dailyCo2Tons,
    profile24h,
    transformerPass,
    waitTimePass,
    overallPass,
    transformerMarginPct: 100 - peak.transformerLoadingPct,
    waitTimeMarginMin: peak.erlang.unstable ? -Infinity : 10 - meanWaitTimeMin,
  };
}
