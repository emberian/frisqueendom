// Procedural animation: all poses computed analytically from parameters.
// 13 joints * 3 (xyz) = 39 floats per pose, relative to waist (origin, facing +Z).
//
// Joint indices: 0=head, 1=neck, 2=L_shoulder, 3=L_elbow, 4=L_wrist,
//   5=R_shoulder, 6=R_elbow, 7=R_wrist, 8=waist,
//   9=L_knee, 10=L_ankle, 11=R_knee, 12=R_ankle

export const JOINT_COUNT = 13;

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

export function markingPose(time: number): Float32Array {
    const out = new Float32Array(JOINT_COUNT * 3);
    const shuffle = Math.sin(time * 4) * 0.05;

    // Athletic crouch
    setJoint(out, 0, shuffle, P.headY - 0.1, 0.1);
    setJoint(out, 1, 0, P.neckY - 0.08, 0.08);
    setJoint(out, 2, -P.shoulderX - 0.1, P.shoulderY - 0.05, 0.05);
    setJoint(out, 3, -P.elbowX - 0.15, P.elbowY + 0.1, 0.15);
    setJoint(out, 4, -P.wristX - 0.2, P.wristY + 0.2, 0.2);
    setJoint(out, 5, P.shoulderX + 0.1, P.shoulderY - 0.05, 0.05);
    setJoint(out, 6, P.elbowX + 0.15, P.elbowY + 0.1, 0.15);
    setJoint(out, 7, P.wristX + 0.2, P.wristY + 0.2, 0.2);
    setJoint(out, 8, shuffle, -0.05, 0);
    setJoint(out, 9, -P.kneeX - 0.05 + shuffle, P.kneeY + 0.1, 0.05);
    setJoint(out, 10, -P.ankleX - 0.05 + shuffle, P.ankleY + 0.05, 0);
    setJoint(out, 11, P.kneeX + 0.05 + shuffle, P.kneeY + 0.1, 0.05);
    setJoint(out, 12, P.ankleX + 0.05 + shuffle, P.ankleY + 0.05, 0);

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
