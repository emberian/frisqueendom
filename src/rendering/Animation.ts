// Procedural animation: all poses computed analytically from parameters.
// 13 joints * 3 (xyz) = 39 floats per pose, relative to waist (origin, facing +Z).
//
// Joint indices: 0=head, 1=neck, 2=L_shoulder, 3=L_elbow, 4=L_wrist,
//   5=R_shoulder, 6=R_elbow, 7=R_wrist, 8=waist,
//   9=L_knee, 10=L_ankle, 11=R_knee, 12=R_ankle

export const JOINT_COUNT = 13;
const FLOATS_PER_POSE = JOINT_COUNT * 3;

/** Linearly interpolate between two poses. t=0 returns a, t=1 returns b. */
export function lerpPose(a: Float32Array, b: Float32Array, t: number): Float32Array {
    const out = new Float32Array(FLOATS_PER_POSE);
    const s = 1 - t;
    for (let i = 0; i < FLOATS_PER_POSE; i++) {
        out[i] = a[i] * s + b[i] * t;
    }
    return out;
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

export function idlePose(time: number): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);
    const breathe = Math.sin(time * 2.1) * 0.01;
    const sway = Math.sin(time * 0.7) * 0.02;
    const headTurn = Math.sin(time * 0.2) * 0.05;

    setJoint(out, 0, headTurn, P.headY + breathe, 0); // head
    setJoint(out, 1, 0, P.neckY + breathe, 0); // neck
    setJoint(out, 2, -P.shoulderX, P.shoulderY + breathe, 0); // L shoulder
    setJoint(out, 3, -P.elbowX + sway, P.elbowY, 0); // L elbow
    setJoint(out, 4, -P.wristX + sway, P.wristY, 0.02); // L wrist
    setJoint(out, 5, P.shoulderX, P.shoulderY + breathe, 0); // R shoulder
    setJoint(out, 6, P.elbowX - sway, P.elbowY, 0); // R elbow
    setJoint(out, 7, P.wristX - sway, P.wristY, 0.02); // R wrist
    setJoint(out, 8, 0, 0, 0); // waist
    setJoint(out, 9, -P.kneeX, P.kneeY + 0.02, 0); // L knee (slightly bent)
    setJoint(out, 10, -P.ankleX, P.ankleY, 0); // L ankle
    setJoint(out, 11, P.kneeX, P.kneeY, 0); // R knee
    setJoint(out, 12, P.ankleX, P.ankleY, 0); // R ankle

    return out;
}

export function runPose(speed: number, phase: number): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);
    const cycle = phase * Math.PI * 2;

    const speedFactor = Math.min(speed / 7.0, 1.0);
    const strideLen = 0.4 * speedFactor;
    const armSwing = 0.25 * speedFactor;
    const lean = (5 + 10 * speedFactor) * (Math.PI / 180);
    const bounce = 0.03 * Math.sin(cycle * 2);
    const hipRot = 0.05 * Math.sin(cycle);

    // Leg swing
    const lLeg = Math.sin(cycle);
    const rLeg = Math.sin(cycle + Math.PI);

    // Knee bend (more when leg is behind)
    const lKneeBend = Math.max(0, -lLeg) * 0.15;
    const rKneeBend = Math.max(0, -rLeg) * 0.15;

    // Forward lean offset
    const leanZ = Math.sin(lean) * 0.3;

    setJoint(out, 0, 0, P.headY + bounce, leanZ * 0.5); // head (stabilized)
    setJoint(out, 1, 0, P.neckY + bounce, leanZ * 0.7); // neck
    setJoint(
        out,
        2,
        -P.shoulderX,
        P.shoulderY + bounce,
        leanZ * 0.8 + rLeg * armSwing,
    ); // L shoulder
    setJoint(
        out,
        3,
        -P.elbowX,
        P.elbowY + bounce + Math.max(0, rLeg) * 0.05,
        leanZ * 0.6 + rLeg * armSwing * 0.8,
    ); // L elbow
    setJoint(
        out,
        4,
        -P.wristX,
        P.wristY + bounce,
        leanZ * 0.4 + rLeg * armSwing * 0.6,
    ); // L wrist
    setJoint(
        out,
        5,
        P.shoulderX,
        P.shoulderY + bounce,
        leanZ * 0.8 + lLeg * armSwing,
    ); // R shoulder
    setJoint(
        out,
        6,
        P.elbowX,
        P.elbowY + bounce + Math.max(0, lLeg) * 0.05,
        leanZ * 0.6 + lLeg * armSwing * 0.8,
    ); // R elbow
    setJoint(
        out,
        7,
        P.wristX,
        P.wristY + bounce,
        leanZ * 0.4 + lLeg * armSwing * 0.6,
    ); // R wrist
    setJoint(out, 8, hipRot * 0.05, bounce, 0); // waist

    // Legs
    setJoint(
        out,
        9,
        -P.kneeX,
        P.kneeY + lKneeBend + bounce * 0.5,
        lLeg * strideLen * 0.5,
    ); // L knee
    setJoint(
        out,
        10,
        -P.ankleX,
        P.ankleY + Math.max(0, lLeg) * 0.08,
        lLeg * strideLen,
    ); // L ankle
    setJoint(
        out,
        11,
        P.kneeX,
        P.kneeY + rKneeBend + bounce * 0.5,
        rLeg * strideLen * 0.5,
    ); // R knee
    setJoint(
        out,
        12,
        P.ankleX,
        P.ankleY + Math.max(0, rLeg) * 0.08,
        rLeg * strideLen,
    ); // R ankle

    return out;
}

export function sprintPose(speed: number, phase: number): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);
    const cycle = phase * Math.PI * 2;

    const speedFactor = Math.min(speed / 9.0, 1.0);
    const strideLen = 0.55 * speedFactor;
    const armSwing = 0.35 * speedFactor;
    const lean = (15 + 5 * speedFactor) * (Math.PI / 180);
    const bounce = 0.04 * Math.sin(cycle * 2);

    const lLeg = Math.sin(cycle);
    const rLeg = Math.sin(cycle + Math.PI);

    const lKneeLift = Math.max(0, lLeg) * 0.2;
    const rKneeLift = Math.max(0, rLeg) * 0.2;
    const lKneeBend = Math.max(0, -lLeg) * 0.2;
    const rKneeBend = Math.max(0, -rLeg) * 0.2;

    const leanZ = Math.sin(lean) * 0.4;

    setJoint(out, 0, 0, P.headY + bounce, leanZ * 0.6); // head
    setJoint(out, 1, 0, P.neckY + bounce, leanZ * 0.8); // neck
    setJoint(
        out,
        2,
        -P.shoulderX,
        P.shoulderY + bounce,
        leanZ + rLeg * armSwing,
    );
    setJoint(
        out,
        3,
        -P.elbowX,
        P.elbowY + bounce + 0.1,
        leanZ * 0.7 + rLeg * armSwing * 0.7,
    );
    setJoint(
        out,
        4,
        -P.wristX,
        P.wristY + bounce + 0.15,
        leanZ * 0.5 + rLeg * armSwing * 0.5,
    );
    setJoint(
        out,
        5,
        P.shoulderX,
        P.shoulderY + bounce,
        leanZ + lLeg * armSwing,
    );
    setJoint(
        out,
        6,
        P.elbowX,
        P.elbowY + bounce + 0.1,
        leanZ * 0.7 + lLeg * armSwing * 0.7,
    );
    setJoint(
        out,
        7,
        P.wristX,
        P.wristY + bounce + 0.15,
        leanZ * 0.5 + lLeg * armSwing * 0.5,
    );
    setJoint(out, 8, 0, bounce, 0);

    setJoint(
        out,
        9,
        -P.kneeX,
        P.kneeY + lKneeLift + lKneeBend + bounce * 0.5,
        lLeg * strideLen * 0.5,
    );
    setJoint(
        out,
        10,
        -P.ankleX,
        P.ankleY + Math.max(0, lLeg) * 0.15,
        lLeg * strideLen,
    );
    setJoint(
        out,
        11,
        P.kneeX,
        P.kneeY + rKneeLift + rKneeBend + bounce * 0.5,
        rLeg * strideLen * 0.5,
    );
    setJoint(
        out,
        12,
        P.ankleX,
        P.ankleY + Math.max(0, rLeg) * 0.15,
        rLeg * strideLen,
    );

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
    const out = new Float32Array(JOINT_COUNT * 3);

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

    return out;
}

export function forehandThrowPose(
    phase: number,
    _power: number,
): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);

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

    return out;
}

export function catchPose(discDirX: number, discDirZ: number): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);
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

    return out;
}

export function markingPose(time: number, intensity: number = 0): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);
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

    return out;
}

export function celebrationPose(time: number): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);
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
    const out = new Float32Array(JOINT_COUNT * 3);
    
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
    
    return out;
}

// Frustration/drop pose
export function frustrationPose(time: number): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);
    
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
    
    return out;
}

// Hammer throw (overhead backhand)
function hammerThrowPose(time: number): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);
    
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
    
    return out;
}

/** Celebration: fist pump — one arm overhead pumping, other on hip */
export function celebrationFistPump(time: number): Float32Array {
    const out = new Float32Array(FLOATS_PER_POSE);
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

    return out;
}

/** Celebration: disc spike — arm slams down, jump back, both arms raised */
export function celebrationSpike(time: number): Float32Array {
    const out = new Float32Array(FLOATS_PER_POSE);

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

    return out;
}

/** Frustration: "what?!" — both arms up in disbelief, head tilted back */
export function frustrationArmsUp(time: number): Float32Array {
    const out = new Float32Array(FLOATS_PER_POSE);
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

    return out;
}

/** Frustration: head drop — shoulders slumped, head hanging, slow trudge */
export function frustrationHeadDrop(time: number): Float32Array {
    const out = new Float32Array(FLOATS_PER_POSE);
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

    return out;
}

// Scoober throw (overhead forehand)
function scooberThrowPose(time: number): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);
    
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
    
    return out;
}
