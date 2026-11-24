export interface GeotechWallParams {
  wallHeightM: number; // 3 - 10 m
  baseWidthM: number; // 2 - 8 m
  frictionAngleDeg: number; // 26 - 40 deg
  soilUnitWeightKnM3: number; // 16 - 21 kN/m3
  allowableBearingKpa: number; // 100 - 400 kPa
  waterTableHeightM: number; // 0 - wallHeightM m above base bottom
  surchargeKpa: number; // 0 - 30 kPa
  surchargeOffsetM: number; // 0 - 4 m behind back of stem
}

export interface WallGeometry {
  wallHeightM: number;
  baseWidthM: number;
  baseThicknessM: number;
  stemTopThicknessM: number;
  stemBottomThicknessM: number;
  toeLengthM: number;
  heelLengthM: number;
  stemBackXM: number;
}

export interface GeotechWallResult {
  geometry: WallGeometry;
  ka: number;
  effectiveWaterHeightM: number;
  drySoilHeightM: number;
  surchargeThrustKnM: number;
  drySoilThrustKnM: number;
  submergedSoilRectThrustKnM: number;
  submergedSoilTriThrustKnM: number;
  hydrostaticThrustKnM: number;
  totalHorizontalForceKnM: number;
  overturningMomentKnM: number;
  baseConcreteWeightKnM: number;
  stemConcreteWeightKnM: number;
  heelSoilWeightKnM: number;
  totalVerticalForceKnM: number;
  resistingMomentKnM: number;
  fosOverturning: number;
  fosSliding: number;
  baseFrictionCoeff: number;
  resultantXM: number;
  eccentricityM: number;
  middleThirdLimitM: number;
  inMiddleThird: boolean;
  qMaxKpa: number;
  qMinKpa: number;
  overturningPass: boolean;
  slidingPass: boolean;
  bearingPass: boolean;
  overallPass: boolean;
  overturningMargin: number;
  slidingMargin: number;
  bearingMarginKpa: number;
}

export const CONCRETE_UNIT_WEIGHT_KN_M3 = 24.0;
export const WATER_UNIT_WEIGHT_KN_M3 = 9.81;
export const FOS_OVERTURNING_REQ = 2.0;
export const FOS_SLIDING_REQ = 1.5;

export const DEFAULT_GEOTECH_PARAMS: GeotechWallParams = {
  wallHeightM: 5.5,
  baseWidthM: 4.5,
  frictionAngleDeg: 34,
  soilUnitWeightKnM3: 18.5,
  allowableBearingKpa: 250,
  waterTableHeightM: 1.0,
  surchargeKpa: 10,
  surchargeOffsetM: 0.0,
};

export const WORST_CASE_GEOTECH_PARAMS: GeotechWallParams = {
  wallHeightM: 8.5,
  baseWidthM: 3.2,
  frictionAngleDeg: 26,
  soilUnitWeightKnM3: 20.5,
  allowableBearingKpa: 160,
  waterTableHeightM: 6.8,
  surchargeKpa: 28,
  surchargeOffsetM: 0.0,
};

export function computeWallGeometry(wallHeightM: number, baseWidthM: number): WallGeometry {
  const H = Math.max(2.0, wallHeightM);
  const B = Math.max(1.5, baseWidthM);
  const baseThicknessM = Math.max(0.45, Math.min(0.95, 0.1 * H));
  const stemTopThicknessM = 0.35;
  const stemBottomThicknessM = Math.max(0.35, Math.min(0.85, 0.08 * H));
  const toeLengthM = Math.min(0.28 * B, 0.35 * H, Math.max(0.3, B - stemBottomThicknessM - 0.3));
  const heelLengthM = Math.max(0.3, B - toeLengthM - stemBottomThicknessM);
  const stemBackXM = toeLengthM + stemBottomThicknessM;

  return {
    wallHeightM: H,
    baseWidthM: toeLengthM + stemBottomThicknessM + heelLengthM,
    baseThicknessM,
    stemTopThicknessM,
    stemBottomThicknessM,
    toeLengthM,
    heelLengthM,
    stemBackXM,
  };
}

export function solveGeotechWall(params: GeotechWallParams): GeotechWallResult {
  const geom = computeWallGeometry(params.wallHeightM, params.baseWidthM);
  const H = geom.wallHeightM;
  const B = geom.baseWidthM;
  const phiRad = (params.frictionAngleDeg * Math.PI) / 180;

  // Rankine active earth pressure coefficient Ka = tan^2(45 - phi/2)
  const ka = Math.pow(Math.tan(Math.PI / 4 - phiRad / 2), 2);

  const hw = Math.max(0, Math.min(H, params.waterTableHeightM));
  const hd = H - hw;
  const gamma = params.soilUnitWeightKnM3;
  const gammaEff = Math.max(1.0, gamma - WATER_UNIT_WEIGHT_KN_M3);

  // Surcharge lateral thrust (45-deg dispersion setback d_s from back of stem)
  const zStart = Math.min(H, Math.max(0, params.surchargeOffsetM));
  const hSurcharge = Math.max(0, H - zStart);
  const surchargeThrustKnM = ka * Math.max(0, params.surchargeKpa) * hSurcharge;
  const surchargeMomentArmM = hSurcharge / 2;

  // Dry soil active wedge above water table
  const drySoilThrustKnM = 0.5 * ka * gamma * hd * hd;
  const drySoilMomentArmM = hw + hd / 3;

  // Overburden from dry soil acting uniformly on submerged zone below hw
  const submergedSoilRectThrustKnM = ka * gamma * hd * hw;
  const submergedSoilRectArmM = hw / 2;

  // Buoyant soil triangle below hw
  const submergedSoilTriThrustKnM = 0.5 * ka * gammaEff * hw * hw;
  const submergedSoilTriArmM = hw / 3;

  // Hydrostatic water pressure below hw
  const hydrostaticThrustKnM = 0.5 * WATER_UNIT_WEIGHT_KN_M3 * hw * hw;
  const hydrostaticArmM = hw / 3;

  const totalHorizontalForceKnM =
    surchargeThrustKnM +
    drySoilThrustKnM +
    submergedSoilRectThrustKnM +
    submergedSoilTriThrustKnM +
    hydrostaticThrustKnM;

  const overturningMomentKnM =
    surchargeThrustKnM * surchargeMomentArmM +
    drySoilThrustKnM * drySoilMomentArmM +
    submergedSoilRectThrustKnM * submergedSoilRectArmM +
    submergedSoilTriThrustKnM * submergedSoilTriArmM +
    hydrostaticThrustKnM * hydrostaticArmM;

  // Resisting weights & moments about Toe (x = 0)
  const baseConcreteWeightKnM = CONCRETE_UNIT_WEIGHT_KN_M3 * B * geom.baseThicknessM;
  const baseMomentKnM = baseConcreteWeightKnM * (B / 2);

  const stemHeightM = H - geom.baseThicknessM;
  const stemRectW = CONCRETE_UNIT_WEIGHT_KN_M3 * geom.stemTopThicknessM * stemHeightM;
  const stemRectX = geom.stemBackXM - geom.stemTopThicknessM / 2;

  const taperWidth = Math.max(0, geom.stemBottomThicknessM - geom.stemTopThicknessM);
  const stemTriW = CONCRETE_UNIT_WEIGHT_KN_M3 * 0.5 * taperWidth * stemHeightM;
  const stemTriX = geom.toeLengthM + (2 / 3) * taperWidth;

  const stemConcreteWeightKnM = stemRectW + stemTriW;
  const stemMomentKnM = stemRectW * stemRectX + stemTriW * stemTriX;

  // Soil column resting on the heel (live traffic surcharge excluded from stabilizing weight)
  const heelSoilWeightKnM = gamma * geom.heelLengthM * stemHeightM;
  const heelSoilX = geom.stemBackXM + geom.heelLengthM / 2;
  const heelMomentKnM = heelSoilWeightKnM * heelSoilX;

  const totalVerticalForceKnM =
    baseConcreteWeightKnM + stemConcreteWeightKnM + heelSoilWeightKnM;
  const resistingMomentKnM = baseMomentKnM + stemMomentKnM + heelMomentKnM;

  const fosOverturning =
    overturningMomentKnM > 0 ? resistingMomentKnM / overturningMomentKnM : Infinity;

  // Interface friction delta = (2/3) * phi
  const baseFrictionCoeff = Math.tan((2 / 3) * phiRad);
  const fosSliding =
    totalHorizontalForceKnM > 0
      ? (totalVerticalForceKnM * baseFrictionCoeff) / totalHorizontalForceKnM
      : Infinity;

  const resultantXM = (resistingMomentKnM - overturningMomentKnM) / totalVerticalForceKnM;
  const eccentricityM = B / 2 - resultantXM;
  const middleThirdLimitM = B / 6;
  const inMiddleThird = Math.abs(eccentricityM) <= middleThirdLimitM + 1e-9;

  let qMaxKpa = 0;
  let qMinKpa = 0;
  if (inMiddleThird) {
    qMaxKpa = (totalVerticalForceKnM / B) * (1 + (6 * Math.abs(eccentricityM)) / B);
    qMinKpa = (totalVerticalForceKnM / B) * (1 - (6 * Math.abs(eccentricityM)) / B);
  } else if (resultantXM > 0 && resultantXM < B) {
    const contactLength = eccentricityM > 0 ? 3 * resultantXM : 3 * (B - resultantXM);
    qMaxKpa = (2 * totalVerticalForceKnM) / Math.max(0.05, contactLength);
    qMinKpa = 0;
  } else {
    qMaxKpa = Infinity;
    qMinKpa = 0;
  }

  const overturningPass = fosOverturning >= FOS_OVERTURNING_REQ;
  const slidingPass = fosSliding >= FOS_SLIDING_REQ;
  const bearingPass = inMiddleThird && qMaxKpa <= params.allowableBearingKpa;
  const overallPass = overturningPass && slidingPass && bearingPass;

  return {
    geometry: geom,
    ka,
    effectiveWaterHeightM: hw,
    drySoilHeightM: hd,
    surchargeThrustKnM,
    drySoilThrustKnM,
    submergedSoilRectThrustKnM,
    submergedSoilTriThrustKnM,
    hydrostaticThrustKnM,
    totalHorizontalForceKnM,
    overturningMomentKnM,
    baseConcreteWeightKnM,
    stemConcreteWeightKnM,
    heelSoilWeightKnM,
    totalVerticalForceKnM,
    resistingMomentKnM,
    fosOverturning,
    fosSliding,
    baseFrictionCoeff,
    resultantXM,
    eccentricityM,
    middleThirdLimitM,
    inMiddleThird,
    qMaxKpa,
    qMinKpa,
    overturningPass,
    slidingPass,
    bearingPass,
    overallPass,
    overturningMargin: fosOverturning - FOS_OVERTURNING_REQ,
    slidingMargin: fosSliding - FOS_SLIDING_REQ,
    bearingMarginKpa: params.allowableBearingKpa - qMaxKpa,
  };
}
