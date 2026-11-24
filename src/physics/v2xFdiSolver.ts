export type AttackType =
  | 'none'
  | 'pos_spoof'
  | 'unphysical_accel'
  | 'ghost_vehicle';

export type ApproachLeg = 'N' | 'S' | 'E' | 'W';

export interface VehicleBaseline {
  id: string;
  leg: ApproachLeg;
  laneOffsetM: number; // lateral offset from center
  distanceToCenterM: number; // + approaching, - departing
  speedMs: number;
  headingDeg: number; // 0=East, 90=South, 180=West, 270=North (screen coords)
  trueLongAccelMs2: number;
  trueLatAccelMs2: number;
  trueJerkMs3: number;
  trueGapAheadM: number;
  precedingSpeedMs: number;
}

export interface V2xFdiParams {
  roadFrictionMu: number; // 0.25 - 0.85
  bsmRateHz: number; // 1 - 10 Hz
  residualThreshold: number; // 0.5 - 5.0 normalized
  attackMagnitude: number; // 0.5 - 2.0 multiplier
  vehicleAttacks: Record<string, AttackType>;
}

export interface VehicleEvaluation {
  id: string;
  leg: ApproachLeg;
  attackType: AttackType;
  truePos: { x: number; y: number };
  reportedPos: { x: number; y: number };
  speedMs: number;
  headingDeg: number;
  reportedLongAccelMs2: number;
  reportedLatAccelMs2: number;
  reportedJerkMs3: number;
  maxLatAccelBoundMs2: number;
  maxLongAccelBoundMs2: number;
  positionErrorM: number;
  idmRequiredGapM: number;
  reportedGapM: number;
  residualScore: number;
  quarantined: boolean;
  isAttacked: boolean;
  isFalsePositive: boolean;
  isMissedDetection: boolean;
  detectionLatencyMs: number | null;
}

export interface V2xFdiResult {
  vehicles: VehicleEvaluation[];
  maxLatAccelBoundMs2: number;
  maxLongAccelBoundMs2: number;
  maxJerkBoundMs3: number;
  dtSec: number;
  activeAttackCount: number;
  quarantinedCount: number;
  falsePositives: number;
  missedDetections: number;
  maxDetectionLatencyMs: number;
  peakResidual: number;
  benignMaxResidual: number;
  protectedPass: boolean;
  latencyMarginMs: number;
}

export const GRAVITY_MS2 = 9.81;
export const MAX_LONG_ACCEL_G = 0.8;
export const MAX_JERK_BOUND_MS3 = 10.0;

export const VEHICLE_BASELINES: readonly VehicleBaseline[] = [
  // Northbound (heading 270 deg, approaching from y > 0 toward y < 0)
  { id: 'V01', leg: 'N', laneOffsetM: 3.6, distanceToCenterM: 28, speedMs: 13.5, headingDeg: 270, trueLongAccelMs2: -0.6, trueLatAccelMs2: 0.12, trueJerkMs3: 0.4, trueGapAheadM: 18, precedingSpeedMs: 12.8 },
  { id: 'V02', leg: 'N', laneOffsetM: 3.6, distanceToCenterM: 52, speedMs: 14.2, headingDeg: 270, trueLongAccelMs2: -0.3, trueLatAccelMs2: 0.08, trueJerkMs3: 0.3, trueGapAheadM: 21, precedingSpeedMs: 13.5 },
  { id: 'V03', leg: 'N', laneOffsetM: 7.2, distanceToCenterM: -32, speedMs: 15.0, headingDeg: 270, trueLongAccelMs2: 1.1, trueLatAccelMs2: 0.15, trueJerkMs3: 0.6, trueGapAheadM: 32, precedingSpeedMs: 15.4 },
  // Southbound (heading 90 deg)
  { id: 'V04', leg: 'S', laneOffsetM: -3.6, distanceToCenterM: 24, speedMs: 11.8, headingDeg: 90, trueLongAccelMs2: -1.4, trueLatAccelMs2: 0.10, trueJerkMs3: 0.7, trueGapAheadM: 17, precedingSpeedMs: 10.5 },
  { id: 'V05', leg: 'S', laneOffsetM: -3.6, distanceToCenterM: 48, speedMs: 13.0, headingDeg: 90, trueLongAccelMs2: 0.2, trueLatAccelMs2: 0.09, trueJerkMs3: 0.2, trueGapAheadM: 20, precedingSpeedMs: 11.8 },
  { id: 'V06', leg: 'S', laneOffsetM: -7.2, distanceToCenterM: -36, speedMs: 16.2, headingDeg: 90, trueLongAccelMs2: 0.9, trueLatAccelMs2: 0.22, trueJerkMs3: 0.5, trueGapAheadM: 34, precedingSpeedMs: 16.5 },
  // Eastbound (heading 0 deg)
  { id: 'V07', leg: 'E', laneOffsetM: 3.6, distanceToCenterM: 30, speedMs: 12.4, headingDeg: 0, trueLongAccelMs2: -1.2, trueLatAccelMs2: 0.14, trueJerkMs3: 0.5, trueGapAheadM: 19, precedingSpeedMs: 11.9 },
  { id: 'V08', leg: 'E', laneOffsetM: 3.6, distanceToCenterM: 56, speedMs: 13.8, headingDeg: 0, trueLongAccelMs2: 0.4, trueLatAccelMs2: 0.11, trueJerkMs3: 0.3, trueGapAheadM: 22, precedingSpeedMs: 12.4 },
  { id: 'V09', leg: 'E', laneOffsetM: 7.2, distanceToCenterM: -28, speedMs: 14.8, headingDeg: 0, trueLongAccelMs2: 1.3, trueLatAccelMs2: 0.18, trueJerkMs3: 0.8, trueGapAheadM: 30, precedingSpeedMs: 15.0 },
  // Westbound (heading 180 deg)
  { id: 'V10', leg: 'W', laneOffsetM: -3.6, distanceToCenterM: 26, speedMs: 12.9, headingDeg: 180, trueLongAccelMs2: -0.9, trueLatAccelMs2: 0.16, trueJerkMs3: 0.5, trueGapAheadM: 18, precedingSpeedMs: 12.2 },
  { id: 'V11', leg: 'W', laneOffsetM: -3.6, distanceToCenterM: 54, speedMs: 14.0, headingDeg: 180, trueLongAccelMs2: 0.5, trueLatAccelMs2: 0.10, trueJerkMs3: 0.3, trueGapAheadM: 24, precedingSpeedMs: 12.9 },
  { id: 'V12', leg: 'W', laneOffsetM: -7.2, distanceToCenterM: -34, speedMs: 15.6, headingDeg: 180, trueLongAccelMs2: 0.8, trueLatAccelMs2: 0.19, trueJerkMs3: 0.6, trueGapAheadM: 35, precedingSpeedMs: 16.0 },
];

export const DEFAULT_VEHICLE_ATTACKS: Record<string, AttackType> = {
  V01: 'none',
  V02: 'none',
  V03: 'none',
  V04: 'pos_spoof',
  V05: 'none',
  V06: 'none',
  V07: 'none',
  V08: 'none',
  V09: 'none',
  V10: 'none',
  V11: 'none',
  V12: 'none',
};

export const DEFAULT_V2X_PARAMS: V2xFdiParams = {
  roadFrictionMu: 0.75,
  bsmRateHz: 10,
  residualThreshold: 1.8,
  attackMagnitude: 1.0,
  vehicleAttacks: { ...DEFAULT_VEHICLE_ATTACKS },
};

export const WORST_CASE_V2X_PARAMS: V2xFdiParams = {
  roadFrictionMu: 0.25,
  bsmRateHz: 2,
  residualThreshold: 1.2,
  attackMagnitude: 1.5,
  vehicleAttacks: {
    ...DEFAULT_VEHICLE_ATTACKS,
    V01: 'unphysical_accel',
    V04: 'pos_spoof',
    V07: 'ghost_vehicle',
  },
};

function legToWorldPos(v: VehicleBaseline): { x: number; y: number } {
  // Distance > 0 means upstream of intersection center (0,0)
  switch (v.leg) {
    case 'N':
      return { x: v.laneOffsetM, y: v.distanceToCenterM };
    case 'S':
      return { x: v.laneOffsetM, y: -v.distanceToCenterM };
    case 'E':
      return { x: -v.distanceToCenterM, y: v.laneOffsetM };
    case 'W':
      return { x: v.distanceToCenterM, y: v.laneOffsetM };
  }
}

export function solveV2xFdi(params: V2xFdiParams): V2xFdiResult {
  const mu = Math.max(0.1, Math.min(1.0, params.roadFrictionMu));
  const bsmRateHz = Math.max(1, Math.min(10, params.bsmRateHz));
  const dtSec = 1 / bsmRateHz;
  const maxLatAccelBoundMs2 = mu * GRAVITY_MS2;
  const maxLongAccelBoundMs2 = MAX_LONG_ACCEL_G * GRAVITY_MS2;
  const maxJerkBoundMs3 = MAX_JERK_BOUND_MS3;

  // Discretization prediction drift grows when BSM broadcast rate is low
  const discretizationNoise = 0.22 * (dtSec / 0.1);

  const vehicles: VehicleEvaluation[] = VEHICLE_BASELINES.map((v, idx) => {
    const attackType: AttackType = params.vehicleAttacks[v.id] ?? 'none';
    const isAttacked = attackType !== 'none';
    const truePos = legToWorldPos(v);
    const rad = (v.headingDeg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);

    let reportedPos = { ...truePos };
    let reportedLongAccelMs2 = v.trueLongAccelMs2;
    let reportedLatAccelMs2 = v.trueLatAccelMs2;
    let reportedJerkMs3 = v.trueJerkMs3;
    let reportedGapM = v.trueGapAheadM;

    if (attackType === 'pos_spoof') {
      const spoofMeters = 15.0 * params.attackMagnitude;
      reportedPos = {
        x: truePos.x + ux * spoofMeters - uy * (2.5 * params.attackMagnitude),
        y: truePos.y + uy * spoofMeters + ux * (2.5 * params.attackMagnitude),
      };
    } else if (attackType === 'unphysical_accel') {
      reportedLongAccelMs2 = 1.25 * GRAVITY_MS2 * params.attackMagnitude;
      reportedLatAccelMs2 = 1.45 * mu * GRAVITY_MS2 * params.attackMagnitude;
      reportedJerkMs3 = 18.0 * params.attackMagnitude;
    } else if (attackType === 'ghost_vehicle') {
      const ghostJumpM = 9.0 * params.attackMagnitude;
      reportedPos = {
        x: truePos.x + ux * ghostJumpM,
        y: truePos.y + uy * ghostJumpM,
      };
      // Phantom injection reports an impossible/colliding car-following gap
      reportedGapM = Math.max(0.5, 2.2 / params.attackMagnitude);
      reportedJerkMs3 = 12.5 * params.attackMagnitude;
    }

    // IDM desired minimum spacing s* = s0 + v*T + (v * dv) / (2 * sqrt(a*b))
    const s0 = 2.0;
    const desiredHeadwayS = 1.4;
    const comfortAccel = 1.6;
    const comfortDecel = 2.2;
    const deltaV = v.speedMs - v.precedingSpeedMs;
    const idmRequiredGapM =
      s0 +
      Math.max(
        0,
        v.speedMs * desiredHeadwayS +
          (v.speedMs * deltaV) / (2 * Math.sqrt(comfortAccel * comfortDecel))
      );

    const positionErrorM = Math.hypot(
      reportedPos.x - truePos.x,
      reportedPos.y - truePos.y
    );

    const rLat =
      Math.max(0, Math.abs(reportedLatAccelMs2) - maxLatAccelBoundMs2) /
      (0.2 * GRAVITY_MS2);
    const rLong =
      Math.max(0, Math.abs(reportedLongAccelMs2) - maxLongAccelBoundMs2) /
      (0.2 * GRAVITY_MS2);
    const rJerk = Math.max(0, Math.abs(reportedJerkMs3) - maxJerkBoundMs3) / 4.0;
    const rPos = positionErrorM / (2.5 + 1.5 * dtSec);
    const rIdm =
      reportedGapM < idmRequiredGapM * 0.45
        ? ((idmRequiredGapM * 0.45 - reportedGapM) / (idmRequiredGapM * 0.45)) * 4.5
        : 0;

    // Slight deterministic variation across benign vehicles plus BSM discretization drift
    const benignBase = 0.14 + (idx % 4) * 0.04 + discretizationNoise;
    const residualScore =
      Math.sqrt(rLat * rLat + rLong * rLong + rJerk * rJerk + rPos * rPos + rIdm * rIdm) +
      benignBase;

    const quarantined = residualScore > params.residualThreshold;
    const isFalsePositive = !isAttacked && quarantined;
    const isMissedDetection = isAttacked && !quarantined;

    let detectionLatencyMs: number | null = null;
    if (isAttacked && quarantined) {
      // RSU verification + pipeline latency: fast (<50ms) at high BSM rate (8-10 Hz),
      // degrades above 50ms when BSM rate drops due to multi-frame buffering requirement.
      const ratePenaltyMs = (10 / bsmRateHz) * 14.0;
      const marginRatio =
        params.residualThreshold /
        Math.max(0.25, residualScore - params.residualThreshold + 0.5);
      detectionLatencyMs = 7.5 + ratePenaltyMs + marginRatio * 5.0;
    }

    return {
      id: v.id,
      leg: v.leg,
      attackType,
      truePos,
      reportedPos,
      speedMs: v.speedMs,
      headingDeg: v.headingDeg,
      reportedLongAccelMs2,
      reportedLatAccelMs2,
      reportedJerkMs3,
      maxLatAccelBoundMs2,
      maxLongAccelBoundMs2,
      positionErrorM,
      idmRequiredGapM,
      reportedGapM,
      residualScore,
      quarantined,
      isAttacked,
      isFalsePositive,
      isMissedDetection,
      detectionLatencyMs,
    };
  });

  const activeAttackCount = vehicles.filter((v) => v.isAttacked).length;
  const quarantinedCount = vehicles.filter((v) => v.quarantined).length;
  const falsePositives = vehicles.filter((v) => v.isFalsePositive).length;
  const missedDetections = vehicles.filter((v) => v.isMissedDetection).length;

  const detectedLatencies = vehicles
    .map((v) => v.detectionLatencyMs)
    .filter((lat): lat is number => lat !== null);

  const maxDetectionLatencyMs =
    missedDetections > 0
      ? Infinity
      : detectedLatencies.length > 0
        ? Math.max(...detectedLatencies)
        : 0;

  const peakResidual = Math.max(...vehicles.map((v) => v.residualScore));
  const benignResiduals = vehicles
    .filter((v) => !v.isAttacked)
    .map((v) => v.residualScore);
  const benignMaxResidual =
    benignResiduals.length > 0 ? Math.max(...benignResiduals) : 0;

  const protectedPass =
    activeAttackCount > 0
      ? falsePositives === 0 && missedDetections === 0 && maxDetectionLatencyMs < 50
      : falsePositives === 0;

  const latencyMarginMs =
    activeAttackCount > 0
      ? missedDetections > 0
        ? -Infinity
        : 50 - maxDetectionLatencyMs
      : 50;

  return {
    vehicles,
    maxLatAccelBoundMs2,
    maxLongAccelBoundMs2,
    maxJerkBoundMs3,
    dtSec,
    activeAttackCount,
    quarantinedCount,
    falsePositives,
    missedDetections,
    maxDetectionLatencyMs,
    peakResidual,
    benignMaxResidual,
    protectedPass,
    latencyMarginMs,
  };
}
