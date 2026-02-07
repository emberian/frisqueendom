use crate::math::Vec3;
use crate::disc::{DiscState, DiscProfile};

const RHO: f32 = 1.225; // air density kg/m^3

pub fn compute_aoa(state: &DiscState, v_rel: Vec3) -> f32 {
    let v_body = state.orientation.conjugate().rotate_vec(v_rel);
    let horizontal = (v_body.x * v_body.x + v_body.z * v_body.z).sqrt();
    (-v_body.y).atan2(horizontal)
}

pub fn compute_lift(state: &DiscState, v_rel: Vec3, alpha: f32, profile: &DiscProfile) -> Vec3 {
    let v_air = v_rel.length();
    if v_air < 0.01 {
        return Vec3::zero();
    }

    let mut cl = profile.cl_0 + profile.cl_alpha * alpha;
    cl = cl.min(profile.cl_max);

    // Gradual stall falloff
    let stall_onset = profile.alpha_stall * 0.8;
    if alpha > stall_onset {
        let t = ((alpha - stall_onset) / (profile.alpha_stall - stall_onset)).min(1.0);
        let smoothstep = t * t * (3.0 - 2.0 * t);
        cl *= 1.0 - 0.6 * smoothstep;
    }

    let magnitude = 0.5 * RHO * v_air * v_air * profile.area * cl;

    // Lift direction: perpendicular to velocity, toward disc top
    let disc_up = state.disc_up();
    let v_cross_up = v_rel.cross(disc_up);
    let lift_dir_raw = v_cross_up.cross(v_rel);
    let lift_dir = if lift_dir_raw.length() < 0.001 {
        disc_up
    } else {
        lift_dir_raw.normalize()
    };

    lift_dir * magnitude
}

pub fn compute_drag(_state: &DiscState, v_rel: Vec3, alpha: f32, profile: &DiscProfile) -> Vec3 {
    let v_air = v_rel.length();
    if v_air < 0.01 {
        return Vec3::zero();
    }

    let cd = profile.cd_0 + profile.cd_alpha * alpha * alpha;
    let magnitude = 0.5 * RHO * v_air * v_air * profile.area * cd;

    -v_rel.normalize() * magnitude
}

pub fn compute_pitching_moment(state: &DiscState, v_rel: Vec3, alpha: f32, profile: &DiscProfile) -> Vec3 {
    let v_air = v_rel.length();
    if v_air < 0.01 {
        return Vec3::zero();
    }

    // cm_alpha is per degree in the profile
    let cm = profile.cm_0 + profile.cm_alpha * alpha.to_degrees();
    let magnitude = 0.5 * RHO * v_air * v_air * profile.area * profile.diameter * cm;

    state.disc_right() * magnitude
}

pub fn compute_spin_down(state: &DiscState, v_rel: Vec3, profile: &DiscProfile) -> Vec3 {
    let v_air = v_rel.length();
    let torque = -profile.spin_decay * state.spin.y * v_air;
    state.disc_up() * torque
}

pub fn compute_ground_effect(state: &DiscState, _v_rel: Vec3, _alpha: f32, profile: &DiscProfile) -> f32 {
    let height = state.position.y;
    if height > profile.diameter * 2.0 {
        return 1.0;
    }
    1.0 + 0.5 * (1.0 - height / (2.0 * profile.diameter)).max(0.0)
}
