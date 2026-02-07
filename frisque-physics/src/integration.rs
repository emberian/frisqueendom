use crate::math::{Vec3, Quat, quat_derivative, quat_step};
use crate::disc::{DiscState, DiscProfile};
use crate::aero;

pub struct DiscDerivatives {
    pub d_position: Vec3,
    pub d_velocity: Vec3,
    pub d_orientation: Quat,
    pub d_spin: Vec3,
}

pub fn derivatives(state: &DiscState, profile: &DiscProfile, wind: Vec3) -> DiscDerivatives {
    let v_rel = state.velocity - wind;
    let v_air = v_rel.length();

    if v_air < 0.01 && state.position.y < 0.01 {
        return DiscDerivatives {
            d_position: Vec3::zero(),
            d_velocity: Vec3::new(0.0, (-9.81_f32 * profile.mass).max(0.0), 0.0),
            d_orientation: Quat::new(0.0, 0.0, 0.0, 0.0),
            d_spin: Vec3::zero(),
        };
    }

    let alpha = aero::compute_aoa(state, v_rel);

    // Forces
    let f_gravity = Vec3::new(0.0, -9.81 * profile.mass, 0.0);
    let ground_effect_factor = aero::compute_ground_effect(state, v_rel, alpha, profile);
    let f_lift = aero::compute_lift(state, v_rel, alpha, profile) * ground_effect_factor;
    let f_drag = aero::compute_drag(state, v_rel, alpha, profile);
    let f_total = f_gravity + f_lift + f_drag;

    // Torques
    let tau_pitch = aero::compute_pitching_moment(state, v_rel, alpha, profile);
    let tau_spindown = aero::compute_spin_down(state, v_rel, profile);
    let tau_total = tau_pitch + tau_spindown;

    // Euler's equations for rigid body rotation (body frame):
    // I * d(omega)/dt + omega x (I * omega) = tau
    let i_omega = Vec3::new(
        profile.i_pitch * state.spin.x,
        profile.i_axial * state.spin.y,
        profile.i_pitch * state.spin.z,
    );
    let gyro = state.spin.cross(i_omega);

    // Convert torque from world frame to body frame
    let tau_body = state.orientation.conjugate().rotate_vec(tau_total);

    let d_spin = Vec3::new(
        (tau_body.x - gyro.x) / profile.i_pitch,
        (tau_body.y - gyro.y) / profile.i_axial,
        (tau_body.z - gyro.z) / profile.i_pitch,
    );

    DiscDerivatives {
        d_position: state.velocity,
        d_velocity: f_total * (1.0 / profile.mass),
        d_orientation: quat_derivative(state.orientation, state.spin),
        d_spin,
    }
}

fn advance(state: &DiscState, d: &DiscDerivatives, dt: f32) -> DiscState {
    DiscState {
        position: state.position + d.d_position * dt,
        velocity: state.velocity + d.d_velocity * dt,
        orientation: (state.orientation + d.d_orientation * dt).normalize(),
        spin: state.spin + d.d_spin * dt,
        grounded: false,
    }
}

/// Advance the disc state by one RK4 step
pub fn step(state: &mut DiscState, dt: f32, profile: &DiscProfile, wind: Vec3) {
    let k1 = derivatives(state, profile, wind);
    let s2 = advance(state, &k1, dt * 0.5);
    let k2 = derivatives(&s2, profile, wind);
    let s3 = advance(state, &k2, dt * 0.5);
    let k3 = derivatives(&s3, profile, wind);
    let s4 = advance(state, &k3, dt);
    let k4 = derivatives(&s4, profile, wind);

    // Weighted average
    state.position = state.position
        + (k1.d_position + k2.d_position * 2.0 + k3.d_position * 2.0 + k4.d_position) * (dt / 6.0);
    state.velocity = state.velocity
        + (k1.d_velocity + k2.d_velocity * 2.0 + k3.d_velocity * 2.0 + k4.d_velocity) * (dt / 6.0);

    // Quaternion integration
    state.orientation = quat_step(
        state.orientation,
        &k1.d_orientation,
        &k2.d_orientation,
        &k3.d_orientation,
        &k4.d_orientation,
        dt,
    );
    state.orientation = state.orientation.normalize();

    state.spin = state.spin
        + (k1.d_spin + k2.d_spin * 2.0 + k3.d_spin * 2.0 + k4.d_spin) * (dt / 6.0);
}
