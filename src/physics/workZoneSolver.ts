export type LosGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface WorkZoneParams {
  approachVolumeVph: number; // 400 - 2200 vph
  heavyVehiclePct: number; // 0 - 35 %
  baseLanes: 2 | 3; // dropping 1 lane in work zone
  cycleLengthS: number; // 60 - 150 s
  effectiveGreenRatio: number; // 0.30 - 0.65
  workZoneStartM: number; // 40 - 320 m downstream of Upstream Intersection A (A-B = 400m)
}

export interface TimeSpaceWave {
  cycleIndex: number;
  departureTimeS: number;
  arrivalAtBarrierS: number;
  arrivalAtIntersectionBS: number;
}

export interface WorkZoneResult {
  openLanes: number;
  heavyVehicleFactor: number;
  workZoneReductionFactor: number;
  adjustedSatFlowVph: number;
  capacityVph: number;
  vcRatio: number;
  uniformDelayS: number;
  incrementalDelayS: number;
  controlDelayS: number;
  losGrade: LosGrade;
  avgVehicleSpacingM: number;
  queueVehiclesPerLane: number;
  queueLengthM: number;
  availableStorageM: number;
  spillbackIntoUpstreamA: boolean;
  storageMarginM: number;
  losPass: boolean;
  spillbackPass: boolean;
  overallPass: boolean;
  delayMarginS: number;
  progressionSpeedMs: number;
  timeSpaceWaves: TimeSpaceWave[];
}

export const CORRIDOR_LENGTH_M = 400;
export const BASE_SAT_FLOW_PC_HR_LN = 1900;
export const HEAVY_VEHICLE_PCE = 2.0;
export const ANALYSIS_PERIOD_HR = 0.25; // 15-min HCM analysis period

export const DEFAULT_WORK_ZONE_PARAMS: WorkZoneParams = {
  approachVolumeVph: 1050,
  heavyVehiclePct: 10,
  baseLanes: 3,
  cycleLengthS: 90,
  effectiveGreenRatio: 0.5,
  workZoneStartM: 220,
};

export const WORST_CASE_WORK_ZONE_PARAMS: WorkZoneParams = {
  approachVolumeVph: 1950,
  heavyVehiclePct: 30,
  baseLanes: 2,
  cycleLengthS: 140,
  effectiveGreenRatio: 0.35,
  workZoneStartM: 90,
};

export function assignLosGrade(controlDelayS: number, vcRatio: number): LosGrade {
  if (vcRatio > 1.0 && controlDelayS > 55) return 'F';
  if (controlDelayS <= 10) return 'A';
  if (controlDelayS <= 20) return 'B';
  if (controlDelayS <= 35) return 'C';
  if (controlDelayS <= 55) return 'D';
  if (controlDelayS <= 80) return 'E';
  return 'F';
}

export function solveWorkZone(params: WorkZoneParams): WorkZoneResult {
  const openLanes = Math.max(1, params.baseLanes - 1);
  const pt = Math.max(0, Math.min(1, params.heavyVehiclePct / 100));

  // HCM 7th Ed. heavy-vehicle adjustment factor f_HV = 1 / [1 + P_T * (E_T - 1)]
  const heavyVehicleFactor = 1 / (1 + pt * (HEAVY_VEHICLE_PCE - 1));

  // Work-zone lane-drop & barrier lateral friction reduction factor
  const workZoneReductionFactor = params.baseLanes === 2 ? 0.85 : 0.90;

  const adjustedSatFlowVph =
    BASE_SAT_FLOW_PC_HR_LN *
    openLanes *
    heavyVehicleFactor *
    workZoneReductionFactor;

  const gOverC = Math.max(0.1, Math.min(0.85, params.effectiveGreenRatio));
  const capacityVph = adjustedSatFlowVph * gOverC;
  const vcRatio = params.approachVolumeVph / Math.max(1, capacityVph);

  // Uniform delay d1 (HCM Eq. 19-19, PF = 1.0)
  const boundedX = Math.min(1.0, vcRatio);
  const denom = Math.max(0.05, 1 - boundedX * gOverC);
  const uniformDelayS =
    (0.5 * params.cycleLengthS * Math.pow(1 - gOverC, 2)) / denom;

  // Incremental delay d2 (HCM Eq. 19-26, k = 0.50, I = 1.0, T = 0.25 hr)
  const k = 0.5;
  const I = 1.0;
  const T = ANALYSIS_PERIOD_HR;
  const capTerm = (8 * k * I * vcRatio) / (Math.max(1, capacityVph) * T);
  const incrementalDelayS =
    900 *
    T *
    (vcRatio - 1 + Math.sqrt(Math.pow(vcRatio - 1, 2) + capTerm));

  const controlDelayS = uniformDelayS + incrementalDelayS;
  const losGrade = assignLosGrade(controlDelayS, vcRatio);

  // Deterministic back-of-queue length along the upstream approach lanes
  const avgVehicleSpacingM = (1 - pt) * 7.0 + pt * 14.0;
  const redDurationS = params.cycleLengthS * (1 - gOverC);
  const arrivalPerApproachLaneS =
    params.approachVolumeVph / (3600 * params.baseLanes);

  const cycleRedQueueVeh = arrivalPerApproachLaneS * redDurationS;
  const overflowQueueVeh = (incrementalDelayS * params.approachVolumeVph) / (3600 * params.baseLanes);
  const queueVehiclesPerLane = cycleRedQueueVeh + overflowQueueVeh;
  const queueLengthM = queueVehiclesPerLane * avgVehicleSpacingM;

  const availableStorageM = params.workZoneStartM;
  const spillbackIntoUpstreamA = queueLengthM > availableStorageM;
  const storageMarginM = availableStorageM - queueLengthM;

  const losPass =
    (losGrade === 'A' || losGrade === 'B' || losGrade === 'C' || losGrade === 'D') &&
    controlDelayS <= 55;
  const spillbackPass = !spillbackIntoUpstreamA;
  const overallPass = losPass && spillbackPass;
  const delayMarginS = 55 - controlDelayS;

  // Free-flow arterial progression speed (m/s), slowed slightly through work zone
  const progressionSpeedMs = 13.4; // ~30 mph (48 km/h)
  const timeSpaceWaves: TimeSpaceWave[] = [0, 1, 2].map((cycleIndex) => {
    const t0 = cycleIndex * params.cycleLengthS;
    const delayAtWz = Math.min(params.cycleLengthS * (1 - gOverC), controlDelayS * 0.45);
    return {
      cycleIndex,
      departureTimeS: t0,
      arrivalAtBarrierS: t0 + params.workZoneStartM / progressionSpeedMs,
      arrivalAtIntersectionBS:
        t0 + CORRIDOR_LENGTH_M / progressionSpeedMs + delayAtWz,
    };
  });

  return {
    openLanes,
    heavyVehicleFactor,
    workZoneReductionFactor,
    adjustedSatFlowVph,
    capacityVph,
    vcRatio,
    uniformDelayS,
    incrementalDelayS,
    controlDelayS,
    losGrade,
    avgVehicleSpacingM,
    queueVehiclesPerLane,
    queueLengthM,
    availableStorageM,
    spillbackIntoUpstreamA,
    storageMarginM,
    losPass,
    spillbackPass,
    overallPass,
    delayMarginS,
    progressionSpeedMs,
    timeSpaceWaves,
  };
}
