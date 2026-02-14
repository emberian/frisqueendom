// Procedural animation: all poses computed analytically from parameters.
// 18 joints * 3 (xyz) = 54 floats per pose, relative to waist (origin, facing +Z).
//
// Joint indices: 0=head, 1=neck, 2=L_shoulder, 3=L_elbow, 4=L_wrist,
//   5=R_shoulder, 6=R_elbow, 7=R_wrist, 8=waist,
//   9=L_knee, 10=L_ankle, 11=R_knee, 12=R_ankle,
//   13=chest, 14=L_hip, 15=R_hip, 16=L_toe, 17=R_toe

export const JOINT_COUNT = 18;
const FLOATS_PER_POSE = JOINT_COUNT * 3;

// Optimization: Pre-allocate static buffers for pose generation to avoid per-frame GC
const POSE_BUFFER = new Float32Array(FLOATS_PER_POSE);
const LERP_BUFFER = new Float32Array(FLOATS_PER_POSE);
const BLEND_BUFFER = new Float32Array(FLOATS_PER_POSE);

/** Linearly interpolate between two poses. t=0 returns a, t=1 returns b. */
export function lerpPose(a: Float32Array, b: Float32Array, t: number): Float32Array {
    const s = 1 - t;
    for (let i = 0; i < FLOATS_PER_POSE; i++) {
        LERP_BUFFER[i] = a[i] * s + b[i] * t;
    }
    return LERP_BUFFER;
}

const P = {
    headY: 0.85,
    neckY: 0.65,
    shoulderY: 0.55,
    shoulderX: 0.25,
    elbowY: 0.35,
    elbowX: 0.35,
    wristY: 0.15,
    wristX: 0.40,
    kneeY: -0.45,
    kneeX: 0.12,
    ankleY: -0.85,
    ankleX: 0.12,
    chestY: 0.30,
    hipY: -0.15,
    hipX: 0.12,
    toeY: -0.88,
    toeZ: 0.12,
};

function setJoint(
    out: Float32Array,
    index: number,
    x: number,
    y: number,
    z: number,
): void {
    out[index * 3] = x;
    out[index * 3 + 1] = y;
    out[index * 3 + 2] = z;
}

/** Set new joints to reasonable defaults based on existing joint positions */
function setNewJointDefaults(out: Float32Array): void {
    // chest = midpoint of neck and waist
    const nx = out[1 * 3], ny = out[1 * 3 + 1], nz = out[1 * 3 + 2];
    const wx = out[8 * 3], wy = out[8 * 3 + 1], wz = out[8 * 3 + 2];
    setJoint(out, 13, (nx + wx) * 0.5, (ny + wy) * 0.5, (nz + wz) * 0.5);
    // L_hip
    setJoint(out, 14, -P.hipX, P.hipY, out[8 * 3 + 2]);
    // R_hip
    setJoint(out, 15, P.hipX, P.hipY, out[8 * 3 + 2]);
    // L_toe = ankle + forward offset
    setJoint(out, 16, out[10 * 3], out[10 * 3 + 1] - 0.03, out[10 * 3 + 2] + P.toeZ);
    // R_toe = ankle + forward offset
    setJoint(out, 17, out[12 * 3], out[12 * 3 + 1] - 0.03, out[12 * 3 + 2] + P.toeZ);
}

export function idlePose(time: number): Float32Array {
    const out = POSE_BUFFER;
    const breathe = Math.sin(time * 2.1) * 0.01;
    const headTurn = Math.sin(time * 0.2) * 0.05;

    // Weight shift: body sways side-to-side, hips drop on non-stance side
    const weightPhase = Math.sin(time * 0.7);
    const weightShift = weightPhase * 0.03; // lateral body shift
    const hipDrop = weightPhase * 0.015; // hip drops on swing side
    const shoulderComp = -hipDrop * 0.4; // shoulders compensate slightly

    setJoint(out, 0, headTurn + weightShift * 0.3, P.headY + breathe, 0); // head stays centered
    setJoint(out, 1, weightShift * 0.5, P.neckY + breathe, 0); // neck
    setJoint(out, 2, -P.shoulderX + weightShift * 0.6, P.shoulderY + breathe - shoulderComp, 0); // L shoulder
    setJoint(out, 3, -P.elbowX + weightShift * 0.8, P.elbowY, 0); // L elbow
    setJoint(out, 4, -P.wristX + weightShift * 0.9, P.wristY, 0.02); // L wrist
    setJoint(out, 5, P.shoulderX + weightShift * 0.6, P.shoulderY + breathe + shoulderComp, 0); // R shoulder
    setJoint(out, 6, P.elbowX + weightShift * 0.8, P.elbowY, 0); // R elbow
    setJoint(out, 7, P.wristX + weightShift * 0.9, P.wristY, 0.02); // R wrist
    setJoint(out, 8, weightShift * 0.7, 0, 0); // waist shifts with weight
    setJoint(out, 9, -P.kneeX, P.kneeY + 0.02, 0); // L knee (slightly bent)
    setJoint(out, 10, -P.ankleX, P.ankleY, 0); // L ankle
    setJoint(out, 11, P.kneeX, P.kneeY, 0); // R knee
    setJoint(out, 12, P.ankleX, P.ankleY, 0); // R ankle

    // chest between neck and waist, follows weight shift
    setJoint(out, 13, weightShift * 0.6, P.chestY + breathe * 0.5, 0);
    // hips slightly wider than knees, with pelvic tilt from weight shift
    setJoint(out, 14, -P.hipX - 0.01, P.hipY - hipDrop, 0); // L hip
    setJoint(out, 15, P.hipX + 0.01, P.hipY + hipDrop, 0); // R hip
    // toes in front of ankles
    setJoint(out, 16, -P.ankleX, P.toeY, P.toeZ); // L toe
    setJoint(out, 17, P.ankleX, P.toeY, P.toeZ); // R toe

    return out;
}

export function runPose(speed: number, phase: number): Float32Array {
    const out = POSE_BUFFER;
    const cycle = phase * Math.PI * 2;

    const speedFactor = Math.min(speed / 7.0, 1.0);
    const strideLen = 0.4 * speedFactor;
    const armSwing = 0.3 * speedFactor;
    const lean = (5 + 10 * speedFactor) * (Math.PI / 180);
    const leanZ = Math.sin(lean) * 0.3;

    // Vertical oscillation: double-frequency, lowest at mid-stance, highest at toe-off
    const bounce = 0.035 * Math.abs(Math.sin(cycle)) * speedFactor;

    // Gait cycle: L leg forward when sin(cycle) > 0
    const lLeg = Math.sin(cycle);        // +1 = L forward peak, -1 = L back peak
    const rLeg = Math.sin(cycle + Math.PI); // opposite

    // --- Contra-lateral rotation ---
    // When right leg forward, right hip forward AND left shoulder forward
    const pelvisRot = 0.08 * speedFactor * Math.sin(cycle); // positive = L hip forward
    const chestRot = -pelvisRot * 0.7; // chest counter-rotates against pelvis
    const shoulderRot = -pelvisRot * 0.9; // shoulders even more counter

    // Pelvic tilt: hip drops on swing-leg side (Trendelenburg)
    const pelvicTilt = 0.02 * speedFactor * Math.sin(cycle); // positive = L side up

    // --- Knee drive ---
    // Forward leg knee drives up (thigh approaches horizontal at peak)
    const lKneeDrive = Math.max(0, lLeg) * 0.22 * speedFactor; // knee lifts when leg forward
    const rKneeDrive = Math.max(0, rLeg) * 0.22 * speedFactor;

    // Trailing leg knee bend (heel kicks up behind)
    const lTrailBend = Math.max(0, -lLeg) * 0.12 * speedFactor;
    const rTrailBend = Math.max(0, -rLeg) * 0.12 * speedFactor;

    // --- Push-off: trailing foot extends through ankle before lifting ---
    const lPushoff = Math.max(0, -lLeg); // 0-1, peaks when leg fully back
    const rPushoff = Math.max(0, -rLeg);

    // --- Head: stabilized, stays level ---
    setJoint(out, 0, 0, P.headY + bounce * 0.3, leanZ * 0.4);
    setJoint(out, 1, 0, P.neckY + bounce * 0.5, leanZ * 0.6);

    // --- Arms: contra-lateral to legs, elbows bend more on forward swing ---
    // L arm swings with rLeg (contra-lateral): forward when R leg forward
    const lArmFwd = rLeg * armSwing; // positive = forward
    const lElbowBend = 0.08 + Math.max(0, rLeg) * 0.12 * speedFactor; // ~90deg on fwd swing
    const lHandLift = Math.max(0, rLeg) * 0.15 * speedFactor; // hand up to chest on fwd

    setJoint(out, 2, -P.shoulderX, P.shoulderY + bounce * 0.7,
        leanZ * 0.8 + shoulderRot * 0.6 + lArmFwd * 0.3);
    setJoint(out, 3, -P.elbowX, P.elbowY + bounce * 0.5 + lElbowBend + lHandLift * 0.5,
        leanZ * 0.6 + shoulderRot * 0.4 + lArmFwd * 0.7);
    setJoint(out, 4, -P.wristX, P.wristY + bounce * 0.3 + lHandLift,
        leanZ * 0.4 + shoulderRot * 0.2 + lArmFwd * 0.5);

    // R arm swings with lLeg (contra-lateral)
    const rArmFwd = lLeg * armSwing;
    const rElbowBend = 0.08 + Math.max(0, lLeg) * 0.12 * speedFactor;
    const rHandLift = Math.max(0, lLeg) * 0.15 * speedFactor;

    setJoint(out, 5, P.shoulderX, P.shoulderY + bounce * 0.7,
        leanZ * 0.8 + shoulderRot * 0.6 + rArmFwd * 0.3);
    setJoint(out, 6, P.elbowX, P.elbowY + bounce * 0.5 + rElbowBend + rHandLift * 0.5,
        leanZ * 0.6 + shoulderRot * 0.4 + rArmFwd * 0.7);
    setJoint(out, 7, P.wristX, P.wristY + bounce * 0.3 + rHandLift,
        leanZ * 0.4 + shoulderRot * 0.2 + rArmFwd * 0.5);

    // --- Waist ---
    setJoint(out, 8, 0, bounce * 0.8, 0);

    // --- Legs with knee drive and push-off ---
    // L leg
    const lKneeZ = lLeg * strideLen * 0.5;
    setJoint(out, 9, -P.kneeX,
        P.kneeY + lKneeDrive + lTrailBend + bounce * 0.4,
        pelvisRot * 0.3 + lKneeZ);
    const lAnkleZ = lLeg * strideLen;
    const lAnkleLift = Math.max(0, lLeg) * 0.1 * speedFactor; // foot lifts when swinging forward
    setJoint(out, 10, -P.ankleX,
        P.ankleY + lAnkleLift + lPushoff * 0.03,
        pelvisRot * 0.4 + lAnkleZ);

    // R leg
    const rKneeZ = rLeg * strideLen * 0.5;
    setJoint(out, 11, P.kneeX,
        P.kneeY + rKneeDrive + rTrailBend + bounce * 0.4,
        pelvisRot * 0.3 + rKneeZ);
    const rAnkleZ = rLeg * strideLen;
    const rAnkleLift = Math.max(0, rLeg) * 0.1 * speedFactor;
    setJoint(out, 12, P.ankleX,
        P.ankleY + rAnkleLift + rPushoff * 0.03,
        pelvisRot * 0.4 + rAnkleZ);

    // --- New joints: chest, hips, toes ---
    // Chest: counter-rotates against pelvis (torso twist)
    setJoint(out, 13, 0, P.chestY + bounce * 0.6, leanZ * 0.7 + chestRot * 0.5);

    // Hips: rotate with pelvis, tilt with Trendelenburg
    setJoint(out, 14, -P.hipX, P.hipY + pelvicTilt + bounce * 0.6, pelvisRot * 0.5);
    setJoint(out, 15, P.hipX, P.hipY - pelvicTilt + bounce * 0.6, pelvisRot * 0.5);

    // Toes: push-off extension for trailing foot, track ankle for leading
    const lToeExtend = lPushoff * 0.06 * speedFactor; // toe extends back during push-off
    setJoint(out, 16, -P.ankleX,
        P.toeY + lAnkleLift * 0.7 + lPushoff * 0.01,
        pelvisRot * 0.4 + lAnkleZ + P.toeZ - lToeExtend);
    const rToeExtend = rPushoff * 0.06 * speedFactor;
    setJoint(out, 17, P.ankleX,
        P.toeY + rAnkleLift * 0.7 + rPushoff * 0.01,
        pelvisRot * 0.4 + rAnkleZ + P.toeZ - rToeExtend);

    return out;
}

export function sprintPose(speed: number, phase: number): Float32Array {
    const out = POSE_BUFFER;
    const cycle = phase * Math.PI * 2;

    const speedFactor = Math.min(speed / 9.0, 1.0);
    const strideLen = 0.55 * speedFactor;
    const armSwing = 0.4 * speedFactor;
    // Deeper forward lean (20-25 degrees)
    const lean = (20 + 5 * speedFactor) * (Math.PI / 180);
    const leanZ = Math.sin(lean) * 0.45;

    // More aggressive vertical oscillation
    const bounce = 0.045 * Math.abs(Math.sin(cycle)) * speedFactor;

    const lLeg = Math.sin(cycle);
    const rLeg = Math.sin(cycle + Math.PI);

    // Greater contra-lateral rotation
    const pelvisRot = 0.12 * speedFactor * Math.sin(cycle);
    const chestRot = -pelvisRot * 0.75;
    const shoulderRot = -pelvisRot * 1.0;

    // Exaggerated pelvic tilt
    const pelvicTilt = 0.025 * speedFactor * Math.sin(cycle);

    // Higher knee drive (thigh nearly horizontal at peak)
    const lKneeDrive = Math.max(0, lLeg) * 0.3 * speedFactor;
    const rKneeDrive = Math.max(0, rLeg) * 0.3 * speedFactor;

    // Trailing leg bend
    const lTrailBend = Math.max(0, -lLeg) * 0.18 * speedFactor;
    const rTrailBend = Math.max(0, -rLeg) * 0.18 * speedFactor;

    // Push-off
    const lPushoff = Math.max(0, -lLeg);
    const rPushoff = Math.max(0, -rLeg);

    // Head: stabilized, stays relatively level
    setJoint(out, 0, 0, P.headY + bounce * 0.25, leanZ * 0.5);
    setJoint(out, 1, 0, P.neckY + bounce * 0.4, leanZ * 0.7);

    // Arms: more aggressive pump, hands up to chin level on forward swing
    const lArmFwd = rLeg * armSwing;
    const lElbowBend = 0.12 + Math.max(0, rLeg) * 0.18 * speedFactor;
    const lHandLift = Math.max(0, rLeg) * 0.22 * speedFactor; // up to chin

    setJoint(out, 2, -P.shoulderX, P.shoulderY + bounce * 0.6,
        leanZ * 0.9 + shoulderRot * 0.6 + lArmFwd * 0.35);
    setJoint(out, 3, -P.elbowX, P.elbowY + bounce * 0.4 + lElbowBend + lHandLift * 0.6,
        leanZ * 0.7 + shoulderRot * 0.4 + lArmFwd * 0.7);
    setJoint(out, 4, -P.wristX, P.wristY + bounce * 0.2 + lHandLift + 0.05,
        leanZ * 0.5 + shoulderRot * 0.2 + lArmFwd * 0.5);

    const rArmFwd = lLeg * armSwing;
    const rElbowBend = 0.12 + Math.max(0, lLeg) * 0.18 * speedFactor;
    const rHandLift = Math.max(0, lLeg) * 0.22 * speedFactor;

    setJoint(out, 5, P.shoulderX, P.shoulderY + bounce * 0.6,
        leanZ * 0.9 + shoulderRot * 0.6 + rArmFwd * 0.35);
    setJoint(out, 6, P.elbowX, P.elbowY + bounce * 0.4 + rElbowBend + rHandLift * 0.6,
        leanZ * 0.7 + shoulderRot * 0.4 + rArmFwd * 0.7);
    setJoint(out, 7, P.wristX, P.wristY + bounce * 0.2 + rHandLift + 0.05,
        leanZ * 0.5 + shoulderRot * 0.2 + rArmFwd * 0.5);

    // Waist
    setJoint(out, 8, 0, bounce * 0.7, 0);

    // Legs with higher knee drive and exaggerated push-off
    const lKneeZ = lLeg * strideLen * 0.5;
    const lAnkleZ = lLeg * strideLen;
    const lAnkleLift = Math.max(0, lLeg) * 0.16 * speedFactor;
    setJoint(out, 9, -P.kneeX,
        P.kneeY + lKneeDrive + lTrailBend + bounce * 0.35,
        pelvisRot * 0.35 + lKneeZ);
    setJoint(out, 10, -P.ankleX,
        P.ankleY + lAnkleLift + lPushoff * 0.04,
        pelvisRot * 0.45 + lAnkleZ);

    const rKneeZ = rLeg * strideLen * 0.5;
    const rAnkleZ = rLeg * strideLen;
    const rAnkleLift = Math.max(0, rLeg) * 0.16 * speedFactor;
    setJoint(out, 11, P.kneeX,
        P.kneeY + rKneeDrive + rTrailBend + bounce * 0.35,
        pelvisRot * 0.35 + rKneeZ);
    setJoint(out, 12, P.ankleX,
        P.ankleY + rAnkleLift + rPushoff * 0.04,
        pelvisRot * 0.45 + rAnkleZ);

    // Chest: counter-rotates harder against pelvis
    setJoint(out, 13, 0, P.chestY + bounce * 0.5, leanZ * 0.8 + chestRot * 0.6);

    // Hips: greater pelvic rotation
    setJoint(out, 14, -P.hipX, P.hipY + pelvicTilt + bounce * 0.5, pelvisRot * 0.6);
    setJoint(out, 15, P.hipX, P.hipY - pelvicTilt + bounce * 0.5, pelvisRot * 0.6);

    // Toes: exaggerated push-off extension
    const lToeExtend = lPushoff * 0.09 * speedFactor;
    setJoint(out, 16, -P.ankleX,
        P.toeY + lAnkleLift * 0.6 + lPushoff * 0.015,
        pelvisRot * 0.45 + lAnkleZ + P.toeZ - lToeExtend);
    const rToeExtend = rPushoff * 0.09 * speedFactor;
    setJoint(out, 17, P.ankleX,
        P.toeY + rAnkleLift * 0.6 + rPushoff * 0.015,
        pelvisRot * 0.45 + rAnkleZ + P.toeZ - rToeExtend);

    return out;
}

export function holdingDiscIdlePose(time: number): Float32Array {
    const out = idlePose(time);
    // Right hand holds disc at hip level (forehand ready)
    setJoint(out, 6, P.elbowX + 0.05, P.elbowY - 0.1, 0.15);
    setJoint(out, 7, P.wristX + 0.1, P.wristY - 0.05, 0.25);
    return out;
}

export function backhandThrowPose(
    phase: number,
    _power: number,
): Float32Array {
    const out = POSE_BUFFER;

    // Simplified throw animation in 3 phases
    let torsoRot: number;
    let armExtend: number;

    if (phase < 0.3) {
        // Wind-up
        const t = phase / 0.3;
        torsoRot = -0.3 * t;
        armExtend = -0.3 * t;
    } else if (phase < 0.5) {
        // Release
        const t = (phase - 0.3) / 0.2;
        torsoRot = -0.3 + 0.6 * t;
        armExtend = -0.3 + 0.8 * t;
    } else {
        // Follow-through
        const t = Math.min(1, (phase - 0.5) / 0.5);
        torsoRot = 0.3 * (1 - t * 0.5);
        armExtend = 0.5 * (1 - t * 0.3);
    }

    setJoint(out, 0, 0, P.headY, 0);
    setJoint(out, 1, 0, P.neckY, 0);
    setJoint(out, 2, -P.shoulderX, P.shoulderY, torsoRot * 0.5);
    setJoint(out, 3, -P.elbowX, P.elbowY, torsoRot * 0.3);
    setJoint(out, 4, -P.wristX, P.wristY, torsoRot * 0.2);
    setJoint(
        out,
        5,
        P.shoulderX,
        P.shoulderY,
        armExtend * 0.8,
    );
    setJoint(out, 6, P.elbowX + 0.1, P.elbowY + 0.05, armExtend * 0.6);
    setJoint(out, 7, P.wristX + 0.15, P.wristY + 0.05, armExtend * 0.9);
    setJoint(out, 8, 0, 0, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, -0.05);
    setJoint(out, 10, -P.ankleX, P.ankleY, -0.08);
    setJoint(out, 11, P.kneeX, P.kneeY, 0.05);
    setJoint(out, 12, P.ankleX, P.ankleY, 0.08);

    setNewJointDefaults(out);
    return out;
}

export function forehandThrowPose(
    phase: number,
    _power: number,
): Float32Array {
    const out = POSE_BUFFER;

    let armSide: number;
    if (phase < 0.2) {
        const t = phase / 0.2;
        armSide = 0.3 * t;
    } else if (phase < 0.35) {
        const t = (phase - 0.2) / 0.15;
        armSide = 0.3 + 0.4 * t;
    } else {
        const t = Math.min(1, (phase - 0.35) / 0.65);
        armSide = 0.7 * (1 - t * 0.3);
    }

    setJoint(out, 0, 0, P.headY, 0);
    setJoint(out, 1, 0, P.neckY, 0);
    setJoint(out, 2, -P.shoulderX, P.shoulderY, 0);
    setJoint(out, 3, -P.elbowX, P.elbowY, 0);
    setJoint(out, 4, -P.wristX, P.wristY, 0);
    setJoint(out, 5, P.shoulderX + armSide * 0.2, P.shoulderY, 0);
    setJoint(
        out,
        6,
        P.elbowX + armSide * 0.4,
        P.elbowY + 0.1,
        armSide * 0.3,
    );
    setJoint(
        out,
        7,
        P.wristX + armSide * 0.5,
        P.wristY + 0.1,
        armSide * 0.5,
    );
    setJoint(out, 8, 0, 0, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

export function catchPose(discDirX: number, discDirZ: number): Float32Array {
    const out = POSE_BUFFER;
    const reach = 0.3;

    setJoint(out, 0, 0, P.headY, 0);
    setJoint(out, 1, 0, P.neckY, 0);
    setJoint(out, 2, -P.shoulderX, P.shoulderY, 0);
    setJoint(
        out,
        3,
        -P.elbowX + discDirX * reach * 0.3,
        P.elbowY + 0.15,
        discDirZ * reach * 0.3,
    );
    setJoint(
        out,
        4,
        -P.wristX + discDirX * reach,
        P.wristY + 0.25,
        discDirZ * reach,
    );
    setJoint(out, 5, P.shoulderX, P.shoulderY, 0);
    setJoint(
        out,
        6,
        P.elbowX + discDirX * reach * 0.3,
        P.elbowY + 0.15,
        discDirZ * reach * 0.3,
    );
    setJoint(
        out,
        7,
        P.wristX + discDirX * reach,
        P.wristY + 0.25,
        discDirZ * reach,
    );
    setJoint(out, 8, 0, 0, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

export function markingPose(time: number, intensity: number = 0): Float32Array {
    const out = POSE_BUFFER;
    // intensity 0-1 scales with stall count (stallCount/10)
    const shuffleSpeed = 4 + intensity * 6;
    const shuffleAmp = 0.05 + intensity * 0.1;
    const shuffle = Math.sin(time * shuffleSpeed) * shuffleAmp;
    const crouch = intensity * 0.15;
    const armReach = 0.1 + intensity * 0.15;

    // At intensity 1.0, one leg forward (lunge stance)
    const lunge = Math.max(0, intensity - 0.8) * 5; // 0-1 over last 20%

    setJoint(out, 0, shuffle, P.headY - 0.1 - crouch, 0.1 + armReach * 0.3);
    setJoint(out, 1, 0, P.neckY - 0.08 - crouch, 0.08 + armReach * 0.2);
    setJoint(out, 2, -P.shoulderX - 0.1, P.shoulderY - 0.05 - crouch, 0.05);
    setJoint(out, 3, -P.elbowX - 0.15, P.elbowY + 0.1 - crouch, 0.15 + armReach);
    setJoint(out, 4, -P.wristX - 0.2, P.wristY + 0.2 - crouch, 0.2 + armReach);
    setJoint(out, 5, P.shoulderX + 0.1, P.shoulderY - 0.05 - crouch, 0.05);
    setJoint(out, 6, P.elbowX + 0.15, P.elbowY + 0.1 - crouch, 0.15 + armReach);
    setJoint(out, 7, P.wristX + 0.2, P.wristY + 0.2 - crouch, 0.2 + armReach);
    setJoint(out, 8, shuffle, -0.05 - crouch, 0);
    setJoint(out, 9, -P.kneeX - 0.05 + shuffle, P.kneeY + 0.1 - crouch + lunge * 0.15, 0.05 + lunge * 0.2);
    setJoint(out, 10, -P.ankleX - 0.05 + shuffle, P.ankleY + 0.05, lunge * 0.35);
    setJoint(out, 11, P.kneeX + 0.05 + shuffle, P.kneeY + 0.1 - crouch, 0.05 - lunge * 0.1);
    setJoint(out, 12, P.ankleX + 0.05 + shuffle, P.ankleY + 0.05, -lunge * 0.15);

    setNewJointDefaults(out);
    return out;
}

export function celebrationPose(time: number): Float32Array {
    const out = POSE_BUFFER;
    const pump = Math.sin(time * 6) * 0.15;
    const jump = Math.max(0, Math.sin(time * 4)) * 0.1;

    setJoint(out, 0, 0, P.headY + jump, 0);
    setJoint(out, 1, 0, P.neckY + jump, 0);
    setJoint(out, 2, -P.shoulderX, P.shoulderY + jump, 0);
    setJoint(out, 3, -P.elbowX, P.elbowY + 0.3 + pump + jump, 0);
    setJoint(out, 4, -P.wristX, P.wristY + 0.5 + pump + jump, 0);
    setJoint(out, 5, P.shoulderX, P.shoulderY + jump, 0);
    setJoint(out, 6, P.elbowX, P.elbowY + 0.3 + pump + jump, 0);
    setJoint(out, 7, P.wristX, P.wristY + 0.5 + pump + jump, 0);
    setJoint(out, 8, 0, jump, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY + jump, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY + jump, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

// Throw pose selector based on throw type and timing
export function throwingPose(
    time: number,
    throwType: 'backhand' | 'forehand' | 'hammer' | 'scoober',
): Float32Array {
    switch (throwType) {
        case 'forehand':
            return forehandThrowPose(time, 0.5);
        case 'hammer':
            return hammerThrowPose(time);
        case 'scoober':
            return scooberThrowPose(time);
        case 'backhand':
        default:
            return backhandThrowPose(time, 0.5);
    }
}

// Layout/diving pose - progress from 0 (start) to 1 (landed)
export function layoutPose(progress: number): Float32Array {
    const out = POSE_BUFFER;
    
    // Layout arc: dive forward then land
    const diveHeight = Math.sin(progress * Math.PI) * 0.5;
    const forwardLean = progress * 1.2; // Radians, leaning forward
    
    // Arms reaching forward
    const armReach = 0.3 + progress * 0.2;
    
    setJoint(out, 0, 0, P.headY + diveHeight, -forwardLean * 0.5);
    setJoint(out, 1, 0, P.neckY + diveHeight, -forwardLean * 0.7);
    setJoint(out, 2, -P.shoulderX, P.shoulderY + diveHeight, -forwardLean + armReach);
    setJoint(out, 3, -P.elbowX, P.elbowY + diveHeight + 0.1, -forwardLean + armReach * 1.2);
    setJoint(out, 4, -P.wristX, P.wristY + diveHeight + 0.15, -forwardLean + armReach * 1.5);
    setJoint(out, 5, P.shoulderX, P.shoulderY + diveHeight, -forwardLean + armReach);
    setJoint(out, 6, P.elbowX, P.elbowY + diveHeight + 0.1, -forwardLean + armReach * 1.2);
    setJoint(out, 7, P.wristX, P.wristY + diveHeight + 0.15, -forwardLean + armReach * 1.5);
    setJoint(out, 8, 0, diveHeight, -forwardLean * 0.9);
    
    // Legs trailing behind
    const legTrail = progress * 0.3;
    setJoint(out, 9, -P.kneeX, P.kneeY + diveHeight * 0.5, -legTrail);
    setJoint(out, 10, -P.ankleX, P.ankleY + diveHeight * 0.3, -legTrail * 1.5);
    setJoint(out, 11, P.kneeX, P.kneeY + diveHeight * 0.5, -legTrail);
    setJoint(out, 12, P.ankleX, P.ankleY + diveHeight * 0.3, -legTrail * 1.5);

    setNewJointDefaults(out);
    return out;
}

// Frustration/drop pose
export function frustrationPose(time: number): Float32Array {
    const out = POSE_BUFFER;
    
    // Shoulders slump, head down, hands on hips or gesturing
    const slump = 0.15;
    const headShake = Math.sin(time * 10) * 0.05 * Math.exp(-time * 2);
    
    setJoint(out, 0, headShake, P.headY - slump, 0.2);
    setJoint(out, 1, 0, P.neckY - slump * 0.8, 0.15);
    setJoint(out, 2, -P.shoulderX, P.shoulderY - slump * 0.5, 0);
    setJoint(out, 3, -P.elbowX, P.elbowY + 0.1, 0.1);
    setJoint(out, 4, -P.wristX, P.wristY + 0.15, 0.05); // Hand on hip
    setJoint(out, 5, P.shoulderX, P.shoulderY - slump * 0.5, 0);
    setJoint(out, 6, P.elbowX, P.elbowY + 0.1, 0.1);
    setJoint(out, 7, P.wristX, P.wristY + 0.15, 0.05);
    setJoint(out, 8, 0, -slump * 0.3, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

// Hammer throw (overhead backhand)
function hammerThrowPose(time: number): Float32Array {
    const out = POSE_BUFFER;
    
    let armHeight: number;
    let armExtend: number;
    
    if (time < 0.3) {
        // Wind-up - arm back and up
        const t = time / 0.3;
        armHeight = t * 0.8;
        armExtend = -t * 0.4;
    } else if (time < 0.45) {
        // Release - snap forward
        const t = (time - 0.3) / 0.15;
        armHeight = 0.8 - t * 0.3;
        armExtend = -0.4 + t * 0.9;
    } else {
        // Follow-through
        const t = Math.min(1, (time - 0.45) / 0.55);
        armHeight = 0.5 * (1 - t);
        armExtend = 0.5 * (1 - t * 0.5);
    }
    
    setJoint(out, 0, 0, P.headY, 0);
    setJoint(out, 1, 0, P.neckY, 0);
    setJoint(out, 2, -P.shoulderX, P.shoulderY + 0.2, 0);
    setJoint(out, 3, -P.elbowX, P.elbowY + armHeight * 0.5, armExtend * 0.5);
    setJoint(out, 4, -P.wristX, P.wristY + armHeight, armExtend);
    setJoint(out, 5, P.shoulderX, P.shoulderY, 0);
    setJoint(out, 6, P.elbowX, P.elbowY, 0);
    setJoint(out, 7, P.wristX, P.wristY, 0);
    setJoint(out, 8, 0, 0, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, -0.05);
    setJoint(out, 10, -P.ankleX, P.ankleY, -0.08);
    setJoint(out, 11, P.kneeX, P.kneeY, 0.05);
    setJoint(out, 12, P.ankleX, P.ankleY, 0.08);

    setNewJointDefaults(out);
    return out;
}

/** Celebration: fist pump — one arm overhead pumping, other on hip */
export function celebrationFistPump(time: number): Float32Array {
    const out = POSE_BUFFER;
    const pump = Math.sin(time * 5) * 0.12;
    const jump = Math.max(0, Math.sin(time * 3.5)) * 0.06;

    setJoint(out, 0, 0, P.headY + jump + 0.03, -0.05); // head tilted back slightly
    setJoint(out, 1, 0, P.neckY + jump, 0);
    setJoint(out, 2, -P.shoulderX, P.shoulderY + jump, 0);
    // Left arm on hip
    setJoint(out, 3, -P.elbowX - 0.1, P.elbowY + 0.05, -0.05);
    setJoint(out, 4, -P.wristX + 0.1, P.wristY + 0.1, -0.08);
    setJoint(out, 5, P.shoulderX, P.shoulderY + jump, 0);
    // Right arm pumping overhead
    setJoint(out, 6, P.elbowX - 0.05, P.elbowY + 0.45 + pump, 0);
    setJoint(out, 7, P.wristX - 0.1, P.wristY + 0.7 + pump, 0);
    setJoint(out, 8, 0, jump, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY + jump, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY + jump, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

/** Celebration: disc spike — arm slams down, jump back, both arms raised */
export function celebrationSpike(time: number): Float32Array {
    const out = POSE_BUFFER;

    // Phase 1 (0-0.4s): slam arm down; Phase 2 (0.4+): both arms up, jumping
    if (time < 0.4) {
        const t = time / 0.4;
        const slamY = P.wristY + 0.5 * (1 - t * 2.5); // arm goes high → low
        setJoint(out, 0, 0, P.headY, -0.05 * t);
        setJoint(out, 1, 0, P.neckY, -0.03 * t);
        setJoint(out, 2, -P.shoulderX, P.shoulderY, 0);
        setJoint(out, 3, -P.elbowX, P.elbowY, 0);
        setJoint(out, 4, -P.wristX, P.wristY, 0);
        setJoint(out, 5, P.shoulderX, P.shoulderY, 0);
        setJoint(out, 6, P.elbowX, P.elbowY + 0.3 * (1 - t), 0.1 * t);
        setJoint(out, 7, P.wristX, Math.max(P.wristY - 0.3, slamY), 0.2 * t);
        setJoint(out, 8, 0, -0.05 * t, 0);
        setJoint(out, 9, -P.kneeX, P.kneeY + 0.05 * t, 0);
        setJoint(out, 10, -P.ankleX, P.ankleY, 0);
        setJoint(out, 11, P.kneeX, P.kneeY + 0.05 * t, 0);
        setJoint(out, 12, P.ankleX, P.ankleY, 0);
    } else {
        const t2 = time - 0.4;
        const bounce = Math.max(0, Math.sin(t2 * 4)) * 0.12;
        const armRaise = Math.min(1, t2 * 3);
        setJoint(out, 0, 0, P.headY + bounce, -0.05);
        setJoint(out, 1, 0, P.neckY + bounce, 0);
        setJoint(out, 2, -P.shoulderX, P.shoulderY + bounce, 0);
        setJoint(out, 3, -P.elbowX, P.elbowY + 0.35 * armRaise + bounce, 0);
        setJoint(out, 4, -P.wristX + 0.1, P.wristY + 0.6 * armRaise + bounce, 0);
        setJoint(out, 5, P.shoulderX, P.shoulderY + bounce, 0);
        setJoint(out, 6, P.elbowX, P.elbowY + 0.35 * armRaise + bounce, 0);
        setJoint(out, 7, P.wristX - 0.1, P.wristY + 0.6 * armRaise + bounce, 0);
        setJoint(out, 8, 0, bounce, 0);
        setJoint(out, 9, -P.kneeX, P.kneeY + bounce, 0);
        setJoint(out, 10, -P.ankleX, P.ankleY, 0);
        setJoint(out, 11, P.kneeX, P.kneeY + bounce, 0);
        setJoint(out, 12, P.ankleX, P.ankleY, 0);
    }

    setNewJointDefaults(out);
    return out;
}

/** Frustration: "what?!" — both arms up in disbelief, head tilted back */
export function frustrationArmsUp(time: number): Float32Array {
    const out = POSE_BUFFER;
    const armDrop = Math.min(1, time * 0.8) * 0.15; // arms slowly drop
    const headShake = Math.sin(time * 8) * 0.04 * Math.exp(-time * 1.5);

    setJoint(out, 0, headShake, P.headY + 0.03, -0.1); // head back
    setJoint(out, 1, 0, P.neckY, -0.05);
    setJoint(out, 2, -P.shoulderX, P.shoulderY, 0);
    setJoint(out, 3, -P.elbowX - 0.15, P.elbowY + 0.35 - armDrop, 0);
    setJoint(out, 4, -P.wristX - 0.1, P.wristY + 0.55 - armDrop, 0.05);
    setJoint(out, 5, P.shoulderX, P.shoulderY, 0);
    setJoint(out, 6, P.elbowX + 0.15, P.elbowY + 0.35 - armDrop, 0);
    setJoint(out, 7, P.wristX + 0.1, P.wristY + 0.55 - armDrop, 0.05);
    setJoint(out, 8, 0, 0, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

/** Frustration: head drop — shoulders slumped, head hanging, slow trudge */
export function frustrationHeadDrop(time: number): Float32Array {
    const out = POSE_BUFFER;
    const slump = 0.2;
    const walkPhase = Math.sin(time * 1.5) * 0.03; // very slow shuffle

    setJoint(out, 0, 0, P.headY - slump - 0.05, 0.15); // head way down
    setJoint(out, 1, 0, P.neckY - slump, 0.1);
    setJoint(out, 2, -P.shoulderX, P.shoulderY - slump * 0.6, 0);
    setJoint(out, 3, -P.elbowX, P.elbowY - 0.05, 0.05); // arms dangling
    setJoint(out, 4, -P.wristX, P.wristY - 0.1, 0.08);
    setJoint(out, 5, P.shoulderX, P.shoulderY - slump * 0.6, 0);
    setJoint(out, 6, P.elbowX, P.elbowY - 0.05, 0.05);
    setJoint(out, 7, P.wristX, P.wristY - 0.1, 0.08);
    setJoint(out, 8, 0, -slump * 0.3, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY + walkPhase, walkPhase * 2);
    setJoint(out, 10, -P.ankleX, P.ankleY, walkPhase * 3);
    setJoint(out, 11, P.kneeX, P.kneeY - walkPhase, -walkPhase * 2);
    setJoint(out, 12, P.ankleX, P.ankleY, -walkPhase * 3);

    setNewJointDefaults(out);
    return out;
}

/** Celebration: backflip — full 360 rotation in mid-air */
export function celebrationBackflip(time: number): Float32Array {
    const out = POSE_BUFFER;
    
    // Phase 1 (0-0.3): crouch; Phase 2 (0.3-0.8): flip; Phase 3 (0.8+): land
    if (time < 0.3) {
        const t = time / 0.3;
        const crouch = t * 0.25;
        setJoint(out, 0, 0, P.headY - crouch, 0.05 * t);
        setJoint(out, 1, 0, P.neckY - crouch, 0.03 * t);
        setJoint(out, 2, -P.shoulderX, P.shoulderY - crouch, -0.1 * t);
        setJoint(out, 3, -P.elbowX - 0.1 * t, P.elbowY - crouch, -0.2 * t);
        setJoint(out, 4, -P.wristX, P.wristY - crouch, -0.3 * t);
        setJoint(out, 5, P.shoulderX, P.shoulderY - crouch, -0.1 * t);
        setJoint(out, 6, P.elbowX + 0.1 * t, P.elbowY - crouch, -0.2 * t);
        setJoint(out, 7, P.wristX, P.wristY - crouch, -0.3 * t);
        setJoint(out, 8, 0, -crouch, 0);
        setJoint(out, 9, -P.kneeX, P.kneeY + 0.2 * t, 0.1 * t);
        setJoint(out, 10, -P.ankleX, P.ankleY + 0.1 * t, 0);
        setJoint(out, 11, P.kneeX, P.kneeY + 0.2 * t, 0.1 * t);
        setJoint(out, 12, P.ankleX, P.ankleY + 0.1 * t, 0);
    } else if (time < 0.9) {
        const t = (time - 0.3) / 0.6;
        const angle = t * Math.PI * 2;
        const height = Math.sin(t * Math.PI) * 1.2;
        const tuck = Math.sin(t * Math.PI) * 0.4;
        
        // We simulate rotation by rotating the joints around waist
        const cos = Math.cos(-angle);
        const sin = Math.sin(-angle);
        
        const rotateY = (y: number, z: number) => y * cos - z * sin;
        const rotateZ = (y: number, z: number) => y * sin + z * cos;

        setJoint(out, 0, 0, height + rotateY(P.headY, 0.1), rotateZ(P.headY, 0.1));
        setJoint(out, 1, 0, height + rotateY(P.neckY, 0.05), rotateZ(P.neckY, 0.05));
        setJoint(out, 2, -P.shoulderX, height + rotateY(P.shoulderY, 0), rotateZ(P.shoulderY, 0));
        setJoint(out, 3, -P.elbowX - tuck, height + rotateY(P.elbowY, -tuck), rotateZ(P.elbowY, -tuck));
        setJoint(out, 4, -P.wristX - tuck, height + rotateY(P.wristY, -tuck * 1.5), rotateZ(P.wristY, -tuck * 1.5));
        setJoint(out, 5, P.shoulderX, height + rotateY(P.shoulderY, 0), rotateZ(P.shoulderY, 0));
        setJoint(out, 6, P.elbowX + tuck, height + rotateY(P.elbowY, -tuck), rotateZ(P.elbowY, -tuck));
        setJoint(out, 7, P.wristX + tuck, height + rotateY(P.wristY, -tuck * 1.5), rotateZ(P.wristY, -tuck * 1.5));
        setJoint(out, 8, 0, height, 0);
        setJoint(out, 9, -P.kneeX, height + rotateY(P.kneeY + tuck, tuck), rotateZ(P.kneeY + tuck, tuck));
        setJoint(out, 10, -P.ankleX, height + rotateY(P.ankleY + tuck * 2, tuck * 2), rotateZ(P.ankleY + tuck * 2, tuck * 2));
        setJoint(out, 11, P.kneeX, height + rotateY(P.kneeY + tuck, tuck), rotateZ(P.kneeY + tuck, tuck));
        setJoint(out, 12, P.ankleX, height + rotateY(P.ankleY + tuck * 2, tuck * 2), rotateZ(P.ankleY + tuck * 2, tuck * 2));
    } else {
        const t = Math.min(1, (time - 0.9) / 0.4);
        const landCrouch = (1 - t) * 0.3;
        setJoint(out, 0, 0, P.headY - landCrouch, 0.1 * (1 - t));
        setJoint(out, 1, 0, P.neckY - landCrouch, 0.05 * (1 - t));
        setJoint(out, 2, -P.shoulderX, P.shoulderY - landCrouch, 0);
        setJoint(out, 3, -P.elbowX, P.elbowY - landCrouch + 0.2 * (1 - t), 0.2 * (1 - t));
        setJoint(out, 4, -P.wristX, P.wristY - landCrouch + 0.4 * (1 - t), 0.3 * (1 - t));
        setJoint(out, 5, P.shoulderX, P.shoulderY - landCrouch, 0);
        setJoint(out, 6, P.elbowX, P.elbowY - landCrouch + 0.2 * (1 - t), 0.2 * (1 - t));
        setJoint(out, 7, P.wristX, P.wristY - landCrouch + 0.4 * (1 - t), 0.3 * (1 - t));
        setJoint(out, 8, 0, -landCrouch, 0);
        setJoint(out, 9, -P.kneeX, P.kneeY + landCrouch, 0.1 * (1 - t));
        setJoint(out, 10, -P.ankleX, P.ankleY, 0);
        setJoint(out, 11, P.kneeX, P.kneeY + landCrouch, 0.1 * (1 - t));
        setJoint(out, 12, P.ankleX, P.ankleY, 0);
    }

    setNewJointDefaults(out);
    return out;
}

// Scoober throw (overhead forehand)
function scooberThrowPose(time: number): Float32Array {
    const out = POSE_BUFFER;
    
    let armHeight: number;
    let armSide: number;
    
    if (time < 0.25) {
        // Wind-up
        const t = time / 0.25;
        armHeight = t * 0.6;
        armSide = t * 0.3;
    } else if (time < 0.4) {
        // Release
        const t = (time - 0.25) / 0.15;
        armHeight = 0.6 + t * 0.2;
        armSide = 0.3 + t * 0.3;
    } else {
        // Follow-through
        const t = Math.min(1, (time - 0.4) / 0.6);
        armHeight = 0.8 * (1 - t * 0.6);
        armSide = 0.6 * (1 - t * 0.4);
    }
    
    setJoint(out, 0, 0, P.headY, 0);
    setJoint(out, 1, 0, P.neckY, 0);
    setJoint(out, 2, -P.shoulderX, P.shoulderY, 0);
    setJoint(out, 3, -P.elbowX, P.elbowY, 0);
    setJoint(out, 4, -P.wristX, P.wristY, 0);
    setJoint(out, 5, P.shoulderX + armSide * 0.2, P.shoulderY + armHeight * 0.3, 0);
    setJoint(out, 6, P.elbowX + armSide * 0.4, P.elbowY + armHeight * 0.6, armSide * 0.3);
    setJoint(out, 7, P.wristX + armSide * 0.5, P.wristY + armHeight, armSide * 0.5);
    setJoint(out, 8, 0, 0, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

// =============================================================================
// Feature 1: Swagger System (Event-Triggered Celebrations)
// =============================================================================

/** Celebration: finger guns — both hands point forward, slight head nod */
export function celebrationFingerGuns(time: number): Float32Array {
    const out = POSE_BUFFER;
    const nod = Math.sin(time * 3) * 0.04;
    const gunKick = Math.sin(time * 5) * 0.03; // recoil

    setJoint(out, 0, 0, P.headY + nod, -0.05);
    setJoint(out, 1, 0, P.neckY, 0);
    setJoint(out, 2, -P.shoulderX, P.shoulderY, 0.05);
    setJoint(out, 3, -P.elbowX - 0.05, P.elbowY + 0.15, 0.2);
    setJoint(out, 4, -P.wristX + 0.05, P.wristY + 0.2 + gunKick, 0.35);
    setJoint(out, 5, P.shoulderX, P.shoulderY, 0.05);
    setJoint(out, 6, P.elbowX + 0.05, P.elbowY + 0.15, 0.2);
    setJoint(out, 7, P.wristX - 0.05, P.wristY + 0.2 + gunKick, 0.35);
    setJoint(out, 8, 0, 0, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

/** Celebration: head nod — subtle nod with relaxed posture */
export function celebrationHeadNod(time: number): Float32Array {
    const out = POSE_BUFFER;
    const nod = Math.sin(time * 4) * 0.06 * Math.exp(-time * 0.8);
    const sway = Math.sin(time * 1.5) * 0.02;

    setJoint(out, 0, sway, P.headY + nod, -0.03 - nod * 0.5);
    setJoint(out, 1, 0, P.neckY, 0);
    setJoint(out, 2, -P.shoulderX, P.shoulderY, 0);
    setJoint(out, 3, -P.elbowX + sway, P.elbowY, 0);
    setJoint(out, 4, -P.wristX + sway, P.wristY, 0.02);
    setJoint(out, 5, P.shoulderX, P.shoulderY, 0);
    setJoint(out, 6, P.elbowX - sway, P.elbowY, 0);
    setJoint(out, 7, P.wristX - sway, P.wristY, 0.02);
    setJoint(out, 8, 0, 0, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

/** Celebration: quick fist pump — single arm quick raise and lower */
export function celebrationQuickPump(time: number): Float32Array {
    const out = POSE_BUFFER;
    const pump = Math.sin(time * 8) * 0.1 * Math.exp(-time * 2);

    setJoint(out, 0, 0, P.headY, 0);
    setJoint(out, 1, 0, P.neckY, 0);
    setJoint(out, 2, -P.shoulderX, P.shoulderY, 0);
    setJoint(out, 3, -P.elbowX, P.elbowY, 0);
    setJoint(out, 4, -P.wristX, P.wristY, 0.02);
    setJoint(out, 5, P.shoulderX, P.shoulderY, 0);
    setJoint(out, 6, P.elbowX - 0.05, P.elbowY + 0.2 + pump, 0);
    setJoint(out, 7, P.wristX - 0.1, P.wristY + 0.4 + pump, 0);
    setJoint(out, 8, 0, 0, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

/** Celebration: flex — both arms flexed, chest out */
export function celebrationFlex(time: number): Float32Array {
    const out = POSE_BUFFER;
    const pulse = Math.sin(time * 3) * 0.02;
    const chestOut = 0.08;

    setJoint(out, 0, 0, P.headY + 0.03, -chestOut * 0.5);
    setJoint(out, 1, 0, P.neckY + 0.02, -chestOut * 0.3);
    setJoint(out, 2, -P.shoulderX - 0.1, P.shoulderY + 0.05, -chestOut);
    setJoint(out, 3, -P.elbowX - 0.15, P.elbowY + 0.3 + pulse, -0.15);
    setJoint(out, 4, -P.wristX + 0.05, P.wristY + 0.35 + pulse, -0.1);
    setJoint(out, 5, P.shoulderX + 0.1, P.shoulderY + 0.05, -chestOut);
    setJoint(out, 6, P.elbowX + 0.15, P.elbowY + 0.3 + pulse, -0.15);
    setJoint(out, 7, P.wristX - 0.05, P.wristY + 0.35 + pulse, -0.1);
    setJoint(out, 8, 0, 0, -chestOut * 0.2);
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

/** Celebration: "come on" arm pump — one arm pumps down repeatedly */
export function celebrationComeOn(time: number): Float32Array {
    const out = POSE_BUFFER;
    const pump = Math.sin(time * 6) * 0.15;
    const lean = 0.05;

    setJoint(out, 0, 0, P.headY + 0.02, -lean);
    setJoint(out, 1, 0, P.neckY, -lean * 0.5);
    setJoint(out, 2, -P.shoulderX, P.shoulderY, 0);
    // Left arm at side, clenched
    setJoint(out, 3, -P.elbowX - 0.05, P.elbowY + 0.05, -0.05);
    setJoint(out, 4, -P.wristX + 0.1, P.wristY + 0.1, -0.08);
    setJoint(out, 5, P.shoulderX, P.shoulderY, 0);
    // Right arm pumping down
    setJoint(out, 6, P.elbowX, P.elbowY + 0.2 + pump, 0.1);
    setJoint(out, 7, P.wristX, P.wristY + 0.15 + pump, 0.15);
    setJoint(out, 8, 0, 0, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY + 0.03, 0.05);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0.08);
    setJoint(out, 11, P.kneeX, P.kneeY, -0.03);
    setJoint(out, 12, P.ankleX, P.ankleY, -0.05);

    setNewJointDefaults(out);
    return out;
}

/** Celebration: knee slide — drop to one knee, arms wide */
export function celebrationKneeSlide(time: number): Float32Array {
    const out = POSE_BUFFER;

    // Phase 1 (0-0.3): drop to knee; Phase 2 (0.3+): slide and pose
    if (time < 0.3) {
        const t = time / 0.3;
        const drop = t * 0.45;
        setJoint(out, 0, 0, P.headY - drop, -0.05 * t);
        setJoint(out, 1, 0, P.neckY - drop, -0.03 * t);
        setJoint(out, 2, -P.shoulderX - 0.1 * t, P.shoulderY - drop, 0);
        setJoint(out, 3, -P.elbowX - 0.2 * t, P.elbowY - drop + 0.2 * t, 0);
        setJoint(out, 4, -P.wristX - 0.25 * t, P.wristY - drop + 0.35 * t, 0);
        setJoint(out, 5, P.shoulderX + 0.1 * t, P.shoulderY - drop, 0);
        setJoint(out, 6, P.elbowX + 0.2 * t, P.elbowY - drop + 0.2 * t, 0);
        setJoint(out, 7, P.wristX + 0.25 * t, P.wristY - drop + 0.35 * t, 0);
        setJoint(out, 8, 0, -drop, 0);
        // Right knee goes down, left stays up
        setJoint(out, 9, -P.kneeX, P.kneeY + 0.1 * t, 0.15 * t);
        setJoint(out, 10, -P.ankleX, P.ankleY + 0.05 * t, 0.25 * t);
        setJoint(out, 11, P.kneeX, P.kneeY + drop * 0.8, 0);
        setJoint(out, 12, P.ankleX, P.ankleY + drop * 0.3, -0.1 * t);
    } else {
        const t2 = time - 0.3;
        const sway = Math.sin(t2 * 3) * 0.03;
        const drop = 0.45;
        setJoint(out, 0, sway, P.headY - drop + 0.02, -0.08);
        setJoint(out, 1, 0, P.neckY - drop, -0.05);
        setJoint(out, 2, -P.shoulderX - 0.1, P.shoulderY - drop, 0);
        setJoint(out, 3, -P.elbowX - 0.2, P.elbowY - drop + 0.2, 0);
        setJoint(out, 4, -P.wristX - 0.25, P.wristY - drop + 0.35, 0);
        setJoint(out, 5, P.shoulderX + 0.1, P.shoulderY - drop, 0);
        setJoint(out, 6, P.elbowX + 0.2, P.elbowY - drop + 0.2, 0);
        setJoint(out, 7, P.wristX + 0.25, P.wristY - drop + 0.35, 0);
        setJoint(out, 8, sway * 0.5, -drop, 0);
        setJoint(out, 9, -P.kneeX, P.kneeY + 0.1, 0.15);
        setJoint(out, 10, -P.ankleX, P.ankleY + 0.05, 0.25);
        setJoint(out, 11, P.kneeX, P.kneeY + drop * 0.8, 0);
        setJoint(out, 12, P.ankleX, P.ankleY + drop * 0.3, -0.1);
    }

    setNewJointDefaults(out);
    return out;
}

/** Celebration: team huddle gesture — both arms beckon inward */
export function celebrationHuddle(time: number): Float32Array {
    const out = POSE_BUFFER;
    const beckon = Math.sin(time * 4) * 0.1;
    const jump = Math.max(0, Math.sin(time * 3)) * 0.06;

    setJoint(out, 0, 0, P.headY + jump, 0);
    setJoint(out, 1, 0, P.neckY + jump, 0);
    setJoint(out, 2, -P.shoulderX - 0.05, P.shoulderY + jump, 0);
    // Arms wide then sweeping inward
    setJoint(out, 3, -P.elbowX - 0.2, P.elbowY + 0.15 + jump, 0.1 + beckon);
    setJoint(out, 4, -P.wristX - 0.15, P.wristY + 0.2 + jump, 0.2 + beckon);
    setJoint(out, 5, P.shoulderX + 0.05, P.shoulderY + jump, 0);
    setJoint(out, 6, P.elbowX + 0.2, P.elbowY + 0.15 + jump, 0.1 + beckon);
    setJoint(out, 7, P.wristX + 0.15, P.wristY + 0.2 + jump, 0.2 + beckon);
    setJoint(out, 8, 0, jump, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY + jump, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY + jump, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

type SwaggerEvent = 'clean_catch' | 'nice_throw' | 'big_play' | 'score' | 'game_winner' | 'block';
type Personality = 'hype' | 'stoic' | 'showboat' | 'team_first' | 'quiet_confidence';

/** Returns celebration pose function based on event severity and personality. */
export function getSwaggerAnimation(
    eventType: SwaggerEvent,
    personality?: Personality
): (time: number) => Float32Array {
    // Determine raw event level (1-4)
    let level: number;
    switch (eventType) {
        case 'clean_catch':
        case 'nice_throw':
            level = 1;
            break;
        case 'big_play':
        case 'block':
            level = 2;
            break;
        case 'score':
            level = 3;
            break;
        case 'game_winner':
            level = 4;
            break;
    }

    // Personality modifies the level
    if (personality) {
        switch (personality) {
            case 'stoic':
                level = Math.max(1, level - 2);
                break;
            case 'quiet_confidence':
                level = Math.max(1, level - 1);
                break;
            case 'showboat':
                level = Math.min(4, level + 2);
                break;
            case 'hype':
                level = Math.min(4, level + 1);
                break;
            case 'team_first':
                // Team-first prefers huddle gestures at higher levels
                if (level >= 3) {
                    return celebrationHuddle;
                }
                break;
        }
    }

    // Map level to celebration function
    switch (level) {
        case 1: {
            // Subtle: finger guns, head nod, quick pump — pick by event
            if (eventType === 'clean_catch') return celebrationFingerGuns;
            if (eventType === 'nice_throw') return celebrationHeadNod;
            return celebrationQuickPump;
        }
        case 2: {
            // Medium: fist pump, flex, "come on"
            if (eventType === 'block') return celebrationFlex;
            if (eventType === 'big_play') return celebrationComeOn;
            return celebrationFistPump;
        }
        case 3: {
            // Big: spike, knee slide, huddle
            if (eventType === 'score') return celebrationSpike;
            return celebrationKneeSlide;
        }
        case 4:
        default:
            // Extended: backflip (longest celebration)
            return celebrationBackflip;
    }
}

// =============================================================================
// Feature 2: Anti-Swagger (Frustration Animations)
// =============================================================================

/** Frustration: drop — head drops, hands on knees, defeated posture */
export function frustrationDrop(time: number): Float32Array {
    const out = POSE_BUFFER;
    const dropSpeed = Math.min(1, time * 2.5);
    const breathe = Math.sin(time * 2) * 0.01;
    const slump = 0.3 * dropSpeed;

    setJoint(out, 0, 0, P.headY - slump - 0.08, 0.2 + breathe);
    setJoint(out, 1, 0, P.neckY - slump * 0.8, 0.15);
    setJoint(out, 2, -P.shoulderX, P.shoulderY - slump * 0.6, 0.05);
    // Hands reaching down to knees
    setJoint(out, 3, -P.elbowX + 0.05, P.elbowY - 0.15 * dropSpeed, 0.15 * dropSpeed);
    setJoint(out, 4, -P.wristX + 0.15, P.wristY - 0.3 * dropSpeed, 0.2 * dropSpeed);
    setJoint(out, 5, P.shoulderX, P.shoulderY - slump * 0.6, 0.05);
    setJoint(out, 6, P.elbowX - 0.05, P.elbowY - 0.15 * dropSpeed, 0.15 * dropSpeed);
    setJoint(out, 7, P.wristX - 0.15, P.wristY - 0.3 * dropSpeed, 0.2 * dropSpeed);
    setJoint(out, 8, 0, -slump * 0.4, 0);
    // Legs slightly bent (knees receiving hands)
    setJoint(out, 9, -P.kneeX, P.kneeY + 0.08 * dropSpeed, 0.05);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY + 0.08 * dropSpeed, 0.05);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

/** Frustration: turnover — arms thrown up in disbelief, then slump */
export function frustrationTurnover(time: number): Float32Array {
    const out = POSE_BUFFER;

    // Phase 1 (0-0.5): arms fly up; Phase 2 (0.5+): slow drop
    if (time < 0.5) {
        const t = time / 0.5;
        const armRaise = t * 0.6;
        const headBack = t * 0.1;
        setJoint(out, 0, 0, P.headY + 0.03 * t, -headBack);
        setJoint(out, 1, 0, P.neckY, -headBack * 0.5);
        setJoint(out, 2, -P.shoulderX, P.shoulderY, 0);
        setJoint(out, 3, -P.elbowX - 0.15 * t, P.elbowY + armRaise, 0);
        setJoint(out, 4, -P.wristX - 0.1 * t, P.wristY + armRaise * 1.3, 0.05 * t);
        setJoint(out, 5, P.shoulderX, P.shoulderY, 0);
        setJoint(out, 6, P.elbowX + 0.15 * t, P.elbowY + armRaise, 0);
        setJoint(out, 7, P.wristX + 0.1 * t, P.wristY + armRaise * 1.3, 0.05 * t);
        setJoint(out, 8, 0, 0, 0);
    } else {
        const t2 = Math.min(1, (time - 0.5) * 0.8);
        const armDrop = 0.6 * (1 - t2 * 0.7);
        const headShake = Math.sin(time * 9) * 0.04 * Math.exp(-(time - 0.5) * 2);
        setJoint(out, 0, headShake, P.headY + 0.03 * (1 - t2), -0.1 * (1 - t2));
        setJoint(out, 1, 0, P.neckY, -0.05 * (1 - t2));
        setJoint(out, 2, -P.shoulderX, P.shoulderY, 0);
        setJoint(out, 3, -P.elbowX - 0.15 * (1 - t2), P.elbowY + armDrop, 0);
        setJoint(out, 4, -P.wristX - 0.1 * (1 - t2), P.wristY + armDrop * 1.3, 0.05 * (1 - t2));
        setJoint(out, 5, P.shoulderX, P.shoulderY, 0);
        setJoint(out, 6, P.elbowX + 0.15 * (1 - t2), P.elbowY + armDrop, 0);
        setJoint(out, 7, P.wristX + 0.1 * (1 - t2), P.wristY + armDrop * 1.3, 0.05 * (1 - t2));
        setJoint(out, 8, 0, -0.05 * t2, 0);
    }
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

/** Frustration: scored on — hands on hips, looking at ground */
export function frustrationScored(time: number): Float32Array {
    const out = POSE_BUFFER;
    const settle = Math.min(1, time * 2);
    const breathe = Math.sin(time * 1.8) * 0.01;
    const headDrop = 0.12 * settle;

    setJoint(out, 0, 0, P.headY - headDrop, 0.12 * settle);
    setJoint(out, 1, 0, P.neckY - headDrop * 0.5, 0.08 * settle);
    setJoint(out, 2, -P.shoulderX, P.shoulderY - 0.03 * settle + breathe, 0);
    // Hands on hips
    setJoint(out, 3, -P.elbowX - 0.12 * settle, P.elbowY + 0.05 * settle, -0.08 * settle);
    setJoint(out, 4, -P.wristX + 0.2 * settle, P.wristY + 0.15 * settle, -0.1 * settle);
    setJoint(out, 5, P.shoulderX, P.shoulderY - 0.03 * settle + breathe, 0);
    setJoint(out, 6, P.elbowX + 0.12 * settle, P.elbowY + 0.05 * settle, -0.08 * settle);
    setJoint(out, 7, P.wristX - 0.2 * settle, P.wristY + 0.15 * settle, -0.1 * settle);
    setJoint(out, 8, 0, -0.03 * settle, 0);
    setJoint(out, 9, -P.kneeX, P.kneeY, 0);
    setJoint(out, 10, -P.ankleX, P.ankleY, 0);
    setJoint(out, 11, P.kneeX, P.kneeY, 0);
    setJoint(out, 12, P.ankleX, P.ankleY, 0);

    setNewJointDefaults(out);
    return out;
}

/** Frustration: missed layout — face down on ground, slow to get up */
export function frustrationMissLayout(time: number): Float32Array {
    const out = POSE_BUFFER;

    // Phase 1 (0-1.5): lying face down; Phase 2 (1.5+): slowly push up
    if (time < 1.5) {
        const faceDown = Math.min(1, time * 3);
        const slightMove = Math.sin(time * 2) * 0.01;
        // Fully prone position
        setJoint(out, 0, slightMove, P.headY * (1 - faceDown * 0.85), -0.5 * faceDown);
        setJoint(out, 1, 0, P.neckY * (1 - faceDown * 0.8), -0.4 * faceDown);
        setJoint(out, 2, -P.shoulderX - 0.1 * faceDown, P.shoulderY * (1 - faceDown * 0.75), -0.3 * faceDown);
        setJoint(out, 3, -P.elbowX - 0.15 * faceDown, P.elbowY * (1 - faceDown * 0.6), -0.2 * faceDown);
        setJoint(out, 4, -P.wristX - 0.1 * faceDown, P.wristY * (1 - faceDown * 0.3), -0.15 * faceDown);
        setJoint(out, 5, P.shoulderX + 0.1 * faceDown, P.shoulderY * (1 - faceDown * 0.75), -0.3 * faceDown);
        setJoint(out, 6, P.elbowX + 0.15 * faceDown, P.elbowY * (1 - faceDown * 0.6), -0.2 * faceDown);
        setJoint(out, 7, P.wristX + 0.1 * faceDown, P.wristY * (1 - faceDown * 0.3), -0.15 * faceDown);
        setJoint(out, 8, 0, -0.6 * faceDown, -0.2 * faceDown);
        setJoint(out, 9, -P.kneeX, P.kneeY * (1 - faceDown * 0.5), -0.1 * faceDown);
        setJoint(out, 10, -P.ankleX, P.ankleY * (1 - faceDown * 0.3), 0);
        setJoint(out, 11, P.kneeX, P.kneeY * (1 - faceDown * 0.5), -0.1 * faceDown);
        setJoint(out, 12, P.ankleX, P.ankleY * (1 - faceDown * 0.3), 0);
    } else {
        // Getting up slowly
        const t = Math.min(1, (time - 1.5) / 2.0);
        const rise = t;
        setJoint(out, 0, 0, P.headY * (0.15 + rise * 0.85) - 0.1 * (1 - rise), -0.5 * (1 - rise) + 0.1 * (1 - rise));
        setJoint(out, 1, 0, P.neckY * (0.2 + rise * 0.8), -0.4 * (1 - rise));
        setJoint(out, 2, -P.shoulderX - 0.1 * (1 - rise), P.shoulderY * (0.25 + rise * 0.75), -0.3 * (1 - rise));
        setJoint(out, 3, -P.elbowX - 0.15 * (1 - rise), P.elbowY * (0.4 + rise * 0.6), -0.15 * (1 - rise));
        setJoint(out, 4, -P.wristX - 0.1 * (1 - rise), P.wristY * (0.7 + rise * 0.3), -0.1 * (1 - rise));
        setJoint(out, 5, P.shoulderX + 0.1 * (1 - rise), P.shoulderY * (0.25 + rise * 0.75), -0.3 * (1 - rise));
        setJoint(out, 6, P.elbowX + 0.15 * (1 - rise), P.elbowY * (0.4 + rise * 0.6), -0.15 * (1 - rise));
        setJoint(out, 7, P.wristX + 0.1 * (1 - rise), P.wristY * (0.7 + rise * 0.3), -0.1 * (1 - rise));
        setJoint(out, 8, 0, -0.6 * (1 - rise), -0.2 * (1 - rise));
        setJoint(out, 9, -P.kneeX, P.kneeY * (0.5 + rise * 0.5), -0.1 * (1 - rise));
        setJoint(out, 10, -P.ankleX, P.ankleY * (0.7 + rise * 0.3), 0);
        setJoint(out, 11, P.kneeX, P.kneeY * (0.5 + rise * 0.5), -0.1 * (1 - rise));
        setJoint(out, 12, P.ankleX, P.ankleY * (0.7 + rise * 0.3), 0);
    }

    setNewJointDefaults(out);
    return out;
}

// =============================================================================
// Feature 3: 2-Bone IK Solver
// =============================================================================

/**
 * Analytical 2-bone IK for arm chains.
 * Modifies joints array in-place. Shoulder stays fixed; elbow and wrist are computed.
 * Left arm: joints 2(shoulder), 3(elbow), 4(wrist)
 * Right arm: joints 5(shoulder), 6(elbow), 7(wrist)
 */
export function solveArmIK(
    joints: Float32Array,
    side: 'left' | 'right',
    targetX: number,
    targetY: number,
    targetZ: number
): void {
    // Joint indices
    const shoulderIdx = side === 'left' ? 2 : 5;
    const elbowIdx = side === 'left' ? 3 : 6;
    const wristIdx = side === 'left' ? 4 : 7;

    // Upper arm length (shoulder to elbow) and forearm length (elbow to wrist)
    const upperLen = Math.sqrt(
        (P.elbowX - P.shoulderX) ** 2 + (P.elbowY - P.shoulderY) ** 2
    );
    const lowerLen = Math.sqrt(
        (P.wristX - P.elbowX) ** 2 + (P.wristY - P.elbowY) ** 2
    );

    // Shoulder position from joints array
    const sx = joints[shoulderIdx * 3];
    const sy = joints[shoulderIdx * 3 + 1];
    const sz = joints[shoulderIdx * 3 + 2];

    // Vector from shoulder to target
    const dx = targetX - sx;
    const dy = targetY - sy;
    const dz = targetZ - sz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Clamp distance to reachable range
    const reach = Math.min(dist, upperLen + lowerLen - 0.001);
    const clampedDist = Math.max(Math.abs(upperLen - lowerLen) + 0.001, reach);

    // Direction from shoulder to target (normalized)
    const invDist = dist > 0.001 ? 1 / dist : 0;
    const dirX = dx * invDist;
    const dirY = dy * invDist;
    const dirZ = dz * invDist;

    // Law of cosines: angle at shoulder
    const cosAngle = (upperLen * upperLen + clampedDist * clampedDist - lowerLen * lowerLen) /
        (2 * upperLen * clampedDist);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    // We need a perpendicular axis to bend the elbow.
    // Use a "pole" hint: prefer bending elbows backward (negative Z for arms).
    // Cross product of direction with up vector for perpendicular.
    let perpX = dirY * 0 - dirZ * 0; // dir cross (0,0,-1) for backward bend
    let perpY = dirZ * 0 - dirX * 0;  // simplified: dir cross -Z
    let perpZ = dirX * 0 - dirY * 0;

    // Actually compute cross(dir, poleHint) properly
    // Pole hint: elbows bend backward (-Z)
    const poleX = 0, poleY = 0, poleZ = -1;
    perpX = dirY * poleZ - dirZ * poleY;
    perpY = dirZ * poleX - dirX * poleZ;
    perpZ = dirX * poleY - dirY * poleX;
    const perpLen = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);
    if (perpLen > 0.001) {
        const invPerp = 1 / perpLen;
        perpX *= invPerp;
        perpY *= invPerp;
        perpZ *= invPerp;
    } else {
        // Fallback: use a different pole if direction is parallel to Z
        const altPerpX = dirY * 1 - dirZ * 0;
        const altPerpY = dirZ * 0 - dirX * 1;
        const altPerpZ = dirX * 0 - dirY * 0;
        const altLen = Math.sqrt(altPerpX ** 2 + altPerpY ** 2 + altPerpZ ** 2);
        if (altLen > 0.001) {
            perpX = altPerpX / altLen;
            perpY = altPerpY / altLen;
            perpZ = altPerpZ / altLen;
        } else {
            perpX = 1; perpY = 0; perpZ = 0;
        }
    }

    // Elbow position: rotate direction by angle around perpendicular
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const elbowX = sx + upperLen * (dirX * cosA + perpX * sinA);
    const elbowY = sy + upperLen * (dirY * cosA + perpY * sinA);
    const elbowZ = sz + upperLen * (dirZ * cosA + perpZ * sinA);

    // Wrist at target (clamped if necessary)
    const wristX = sx + dirX * clampedDist;
    const wristY = sy + dirY * clampedDist;
    const wristZ = sz + dirZ * clampedDist;

    // Write back
    joints[elbowIdx * 3] = elbowX;
    joints[elbowIdx * 3 + 1] = elbowY;
    joints[elbowIdx * 3 + 2] = elbowZ;
    joints[wristIdx * 3] = wristX;
    joints[wristIdx * 3 + 1] = wristY;
    joints[wristIdx * 3 + 2] = wristZ;
}

/**
 * Analytical 2-bone IK for leg chains.
 * Modifies joints array in-place. Hip stays fixed; knee and ankle are computed.
 * Left leg: joints 8(waist/hip), 9(knee), 10(ankle)
 * Right leg: joints 8(waist/hip), 11(knee), 12(ankle)
 */
export function solveLegIK(
    joints: Float32Array,
    side: 'left' | 'right',
    targetX: number,
    targetY: number,
    targetZ: number
): void {
    // Joint indices
    const hipIdx = 8; // shared waist/hip for both legs
    const kneeIdx = side === 'left' ? 9 : 11;
    const ankleIdx = side === 'left' ? 10 : 12;

    // Thigh length (hip to knee) and shin length (knee to ankle)
    const thighLen = Math.sqrt(
        (P.kneeX) ** 2 + (P.kneeY) ** 2
    );
    const shinLen = Math.sqrt(
        (P.ankleX - P.kneeX) ** 2 + (P.ankleY - P.kneeY) ** 2
    );

    // Hip position from joints array
    const hx = joints[hipIdx * 3];
    const hy = joints[hipIdx * 3 + 1];
    const hz = joints[hipIdx * 3 + 2];

    // Offset hip X for left vs right leg
    const hipOffsetX = side === 'left' ? -P.kneeX : P.kneeX;
    const hipX = hx + hipOffsetX;
    const hipY = hy;
    const hipZ = hz;

    // Vector from effective hip to target
    const dx = targetX - hipX;
    const dy = targetY - hipY;
    const dz = targetZ - hipZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Clamp distance
    const reach = Math.min(dist, thighLen + shinLen - 0.001);
    const clampedDist = Math.max(Math.abs(thighLen - shinLen) + 0.001, reach);

    // Direction
    const invDist = dist > 0.001 ? 1 / dist : 0;
    const dirX = dx * invDist;
    const dirY = dy * invDist;
    const dirZ = dz * invDist;

    // Law of cosines for knee angle
    const cosAngle = (thighLen * thighLen + clampedDist * clampedDist - shinLen * shinLen) /
        (2 * thighLen * clampedDist);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    // Pole hint: knees bend forward (+Z)
    const poleX = 0, poleY = 0, poleZ = 1;
    let perpX = dirY * poleZ - dirZ * poleY;
    let perpY = dirZ * poleX - dirX * poleZ;
    let perpZ = dirX * poleY - dirY * poleX;
    const perpLen = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);
    if (perpLen > 0.001) {
        const invPerp = 1 / perpLen;
        perpX *= invPerp;
        perpY *= invPerp;
        perpZ *= invPerp;
    } else {
        // Fallback
        perpX = 1; perpY = 0; perpZ = 0;
    }

    // Knee position
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const kneeX = hipX + thighLen * (dirX * cosA + perpX * sinA);
    const kneeY = hipY + thighLen * (dirY * cosA + perpY * sinA);
    const kneeZ = hipZ + thighLen * (dirZ * cosA + perpZ * sinA);

    // Ankle at target (clamped)
    const ankleX = hipX + dirX * clampedDist;
    const ankleY = hipY + dirY * clampedDist;
    const ankleZ = hipZ + dirZ * clampedDist;

    // Write back
    joints[kneeIdx * 3] = kneeX;
    joints[kneeIdx * 3 + 1] = kneeY;
    joints[kneeIdx * 3 + 2] = kneeZ;
    joints[ankleIdx * 3] = ankleX;
    joints[ankleIdx * 3 + 1] = ankleY;
    joints[ankleIdx * 3 + 2] = ankleZ;
}

// =============================================================================
// Feature 4: Additive Animation Blending
// =============================================================================

/**
 * Blend two poses together. Factor 0 = all base, 1 = all overlay.
 * Optional startJoint/endJoint restrict blending to a joint range
 * (e.g., 0-7 for upper body only, keeping base legs at 8-12).
 * Returns a new Float32Array (uses static buffer to avoid GC).
 */
export function blendPoses(
    base: Float32Array,
    overlay: Float32Array,
    factor: number,
    startJoint?: number,
    endJoint?: number
): Float32Array {
    const out = BLEND_BUFFER;
    const start = (startJoint ?? 0) * 3;
    const end = ((endJoint ?? JOINT_COUNT - 1) + 1) * 3;
    const f = Math.max(0, Math.min(1, factor));
    const invF = 1 - f;

    // Copy entire base first
    for (let i = 0; i < FLOATS_PER_POSE; i++) {
        out[i] = base[i];
    }

    // Blend overlay into the specified range
    for (let i = start; i < end; i++) {
        out[i] = base[i] * invF + overlay[i] * f;
    }

    return out;
}

// =============================================================================
// Feature 5: Marking Dance Animation
// =============================================================================

/**
 * Marking stance driven by stall count intensity (0-1).
 * Low (0-0.33): relaxed athletic stance, slight sway
 * Medium (0.33-0.66): active hands, leaning forward
 * High (0.66-1.0): aggressive, crowding, arms flailing
 */
export function markingStance(time: number, intensity: number): Float32Array {
    const out = POSE_BUFFER;
    const clampI = Math.max(0, Math.min(1, intensity));

    // Side-to-side shuffle increases with intensity
    const shuffleSpeed = 3 + clampI * 8;
    const shuffleAmp = 0.04 + clampI * 0.12;
    const shuffle = Math.sin(time * shuffleSpeed) * shuffleAmp;

    // Crouch increases with intensity
    const crouch = clampI * 0.2;

    // Forward lean increases with intensity
    const forwardLean = 0.03 + clampI * 0.15;

    // Sway — relaxed at low intensity, jittery at high
    const swaySpeed = 2 + clampI * 6;
    const swayAmp = 0.02 + clampI * 0.06;
    const sway = Math.sin(time * swaySpeed) * swayAmp;

    // Arm behavior varies by intensity tier
    let lElbowX: number, lElbowY: number, lElbowZ: number;
    let lWristX: number, lWristY: number, lWristZ: number;
    let rElbowX: number, rElbowY: number, rElbowZ: number;
    let rWristX: number, rWristY: number, rWristZ: number;

    if (clampI < 0.33) {
        // Low: relaxed athletic stance, arms slightly out
        const t = clampI / 0.33;
        lElbowX = -P.elbowX - 0.08 - t * 0.05;
        lElbowY = P.elbowY + 0.05 - crouch;
        lElbowZ = forwardLean + sway;
        lWristX = -P.wristX - 0.1 - t * 0.05;
        lWristY = P.wristY + 0.1 - crouch;
        lWristZ = forwardLean * 1.2 + sway;
        rElbowX = P.elbowX + 0.08 + t * 0.05;
        rElbowY = P.elbowY + 0.05 - crouch;
        rElbowZ = forwardLean - sway;
        rWristX = P.wristX + 0.1 + t * 0.05;
        rWristY = P.wristY + 0.1 - crouch;
        rWristZ = forwardLean * 1.2 - sway;
    } else if (clampI < 0.66) {
        // Medium: active hands, wider stance, more forward
        const t = (clampI - 0.33) / 0.33;
        const handMove = Math.sin(time * 5) * 0.06 * (0.5 + t * 0.5);
        lElbowX = -P.elbowX - 0.13 - t * 0.05;
        lElbowY = P.elbowY + 0.12 + handMove - crouch;
        lElbowZ = forwardLean * 1.3;
        lWristX = -P.wristX - 0.15 - t * 0.08;
        lWristY = P.wristY + 0.2 + handMove - crouch;
        lWristZ = forwardLean * 1.5 + 0.05;
        rElbowX = P.elbowX + 0.13 + t * 0.05;
        rElbowY = P.elbowY + 0.12 - handMove - crouch;
        rElbowZ = forwardLean * 1.3;
        rWristX = P.wristX + 0.15 + t * 0.08;
        rWristY = P.wristY + 0.2 - handMove - crouch;
        rWristZ = forwardLean * 1.5 + 0.05;
    } else {
        // High: aggressive, arms flailing, crowding
        const t = (clampI - 0.66) / 0.34;
        const flail = Math.sin(time * 8) * 0.1 * (0.5 + t * 0.5);
        const flail2 = Math.cos(time * 6.5) * 0.08 * (0.5 + t * 0.5);
        lElbowX = -P.elbowX - 0.18 - t * 0.05;
        lElbowY = P.elbowY + 0.18 + flail - crouch;
        lElbowZ = forwardLean * 1.5 + flail2;
        lWristX = -P.wristX - 0.23 - t * 0.05;
        lWristY = P.wristY + 0.3 + flail * 1.3 - crouch;
        lWristZ = forwardLean * 1.8 + flail2 * 1.2;
        rElbowX = P.elbowX + 0.18 + t * 0.05;
        rElbowY = P.elbowY + 0.18 - flail - crouch;
        rElbowZ = forwardLean * 1.5 - flail2;
        rWristX = P.wristX + 0.23 + t * 0.05;
        rWristY = P.wristY + 0.3 - flail * 1.3 - crouch;
        rWristZ = forwardLean * 1.8 - flail2 * 1.2;
    }

    // Head: tracks slightly side to side, drops with crouch
    setJoint(out, 0, shuffle * 0.8, P.headY - crouch * 0.6 - 0.05, forwardLean * 0.6);
    setJoint(out, 1, shuffle * 0.3, P.neckY - crouch * 0.5 - 0.03, forwardLean * 0.4);
    // Shoulders: wider and lower with intensity
    setJoint(out, 2, -P.shoulderX - 0.05 * clampI + shuffle * 0.2, P.shoulderY - crouch * 0.4, forwardLean * 0.3);
    setJoint(out, 3, lElbowX + shuffle * 0.15, lElbowY, lElbowZ);
    setJoint(out, 4, lWristX + shuffle * 0.1, lWristY, lWristZ);
    setJoint(out, 5, P.shoulderX + 0.05 * clampI + shuffle * 0.2, P.shoulderY - crouch * 0.4, forwardLean * 0.3);
    setJoint(out, 6, rElbowX + shuffle * 0.15, rElbowY, rElbowZ);
    setJoint(out, 7, rWristX + shuffle * 0.1, rWristY, rWristZ);
    // Waist: shuffles side to side, drops with crouch
    setJoint(out, 8, shuffle, -crouch * 0.3, 0);
    // Legs: wider athletic stance, shuffling
    const legShuffle = Math.sin(time * shuffleSpeed + 0.5) * shuffleAmp * 0.7;
    const stanceWidth = 0.03 + clampI * 0.06;
    setJoint(out, 9, -P.kneeX - stanceWidth + shuffle, P.kneeY + 0.08 + crouch * 0.3, forwardLean * 0.3 + legShuffle);
    setJoint(out, 10, -P.ankleX - stanceWidth + shuffle, P.ankleY + 0.03, legShuffle * 1.5);
    setJoint(out, 11, P.kneeX + stanceWidth + shuffle, P.kneeY + 0.08 + crouch * 0.3, forwardLean * 0.3 - legShuffle);
    setJoint(out, 12, P.ankleX + stanceWidth + shuffle, P.ankleY + 0.03, -legShuffle * 1.5);

    setNewJointDefaults(out);
    return out;
}

// =============================================================================

export function getPose(name: string, time: number): Float32Array {
    switch (name) {
        case 'run': return runPose(6, time % 1.0);
        case 'sprint': return sprintPose(9, time % 1.0);
        case 'throw': return throwingPose(time, 'backhand');
        case 'layout': return layoutPose(time);
        case 'celebrate': return celebrationPose(time);
        case 'frustrated': return frustrationPose(time);
        case 'marking': return markingPose(time, 0.5);
        case 'holding_disc': return holdingDiscIdlePose(time);
        case 'idle':
        default:
            return idlePose(time);
    }
}
