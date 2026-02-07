use wasm_bindgen::prelude::*;

mod math;
mod disc;
mod aero;
mod integration;
mod wind;
mod ground;
mod noise;

use math::{Vec3, Quat};
use disc::{DiscState, DiscProfile, default_ultimate_disc};

#[wasm_bindgen]
pub struct DiscSimulator {
    state: DiscState,
    profile: DiscProfile,
    wind: wind::WindField,
}

#[wasm_bindgen]
impl DiscSimulator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> DiscSimulator {
        DiscSimulator {
            state: DiscState::new(),
            profile: default_ultimate_disc(),
            wind: wind::WindField::new(0.0, 0.0),
        }
    }

    pub fn throw_disc(
        &mut self,
        speed: f32,
        dir_x: f32,
        dir_y: f32,
        dir_z: f32,
        spin_rate: f32,
        nose_angle: f32,
        hyzer_angle: f32,
        release_height: f32,
        off_axis: f32,
        is_forehand: bool,
    ) {
        let direction = Vec3::new(dir_x, dir_y, dir_z).normalize();

        // Build orientation from throw direction + hyzer + nose angles
        // Disc body +X is "forward". R_y(yaw) maps (1,0,0) to (cos(yaw), 0, -sin(yaw)).
        // To align +X_body with horizontal throw direction (dir_x, 0, dir_z):
        //   cos(yaw) = dir_x/h, -sin(yaw) = dir_z/h  =>  yaw = atan2(-dir_z, dir_x)
        let horizontal_dir_x = direction.x;
        let horizontal_dir_z = direction.z;
        let yaw = (-horizontal_dir_z).atan2(horizontal_dir_x);
        let mut orientation = Quat::from_axis_angle(Vec3::new(0.0, 1.0, 0.0), yaw);

        // Pitch to align disc with velocity direction, then add nose angle on top
        let horizontal_mag = (direction.x * direction.x + direction.z * direction.z).sqrt();
        let vel_pitch = direction.y.atan2(horizontal_mag);
        let pitch_axis = orientation.rotate_vec(Vec3::new(0.0, 0.0, 1.0));
        orientation = Quat::from_axis_angle(pitch_axis, vel_pitch + nose_angle) * orientation;

        // Apply hyzer/anhyzer (roll)
        let roll_axis = orientation.rotate_vec(Vec3::new(1.0, 0.0, 0.0));
        orientation = Quat::from_axis_angle(roll_axis, hyzer_angle) * orientation;

        // Spin: forehand = negative spin.y, backhand = positive spin.y
        let spin_y = if is_forehand { -spin_rate } else { spin_rate };

        self.state = DiscState {
            position: Vec3::new(0.0, release_height, 0.0),
            velocity: direction * speed,
            orientation,
            spin: Vec3::new(off_axis, spin_y, 0.0),
            grounded: false,
        };
    }

    pub fn set_position(&mut self, x: f32, y: f32, z: f32) {
        self.state.position = Vec3::new(x, y, z);
    }

    /// Step the simulation forward by dt seconds. Returns false if disc is grounded.
    pub fn step(&mut self, dt: f32) -> bool {
        if self.state.grounded {
            return false;
        }
        let wind_at_disc = self.wind.sample(self.state.position);
        integration::step(&mut self.state, dt, &self.profile, wind_at_disc);
        ground::check_ground(&mut self.state);
        !self.state.grounded
    }

    // Position getters
    pub fn pos_x(&self) -> f32 { self.state.position.x }
    pub fn pos_y(&self) -> f32 { self.state.position.y }
    pub fn pos_z(&self) -> f32 { self.state.position.z }

    // Velocity getters
    pub fn vel_x(&self) -> f32 { self.state.velocity.x }
    pub fn vel_y(&self) -> f32 { self.state.velocity.y }
    pub fn vel_z(&self) -> f32 { self.state.velocity.z }

    // Orientation as quaternion
    pub fn quat_x(&self) -> f32 { self.state.orientation.x }
    pub fn quat_y(&self) -> f32 { self.state.orientation.y }
    pub fn quat_z(&self) -> f32 { self.state.orientation.z }
    pub fn quat_w(&self) -> f32 { self.state.orientation.w }

    pub fn spin_rate(&self) -> f32 { self.state.spin.y.abs() }
    pub fn is_grounded(&self) -> bool { self.state.grounded }

    // Wind control
    pub fn set_base_wind(&mut self, speed: f32, direction: f32) {
        self.wind = wind::WindField::new(speed, direction);
    }

    pub fn wind_at_x(&self, x: f32, y: f32, z: f32) -> f32 {
        self.wind.sample(Vec3::new(x, y, z)).x
    }
    pub fn wind_at_y(&self, x: f32, y: f32, z: f32) -> f32 {
        self.wind.sample(Vec3::new(x, y, z)).y
    }
    pub fn wind_at_z(&self, x: f32, y: f32, z: f32) -> f32 {
        self.wind.sample(Vec3::new(x, y, z)).z
    }

    pub fn update_wind(&mut self, dt: f32) {
        self.wind.update(dt);
    }

    /// Predict trajectory. Returns flat array of [x,y,z, x,y,z, ...] positions.
    pub fn predict(&self, duration: f32, steps: u32) -> Vec<f32> {
        let dt = duration / steps as f32;
        let mut state = self.state.clone();
        let mut result = Vec::with_capacity((steps as usize) * 3);

        for _ in 0..steps {
            let w = self.wind.sample(state.position);
            integration::step(&mut state, dt, &self.profile, w);
            if state.grounded {
                result.push(state.position.x);
                result.push(state.position.y);
                result.push(state.position.z);
                break;
            }
            result.push(state.position.x);
            result.push(state.position.y);
            result.push(state.position.z);
        }
        result
    }
}

// --- Tests (run with `cargo test` from frisque-physics/) ---

#[cfg(test)]
mod tests {
    use super::*;

    const DT: f32 = 1.0 / 240.0;

    /// Helper: throw a disc and simulate until grounded, returning flight stats
    fn simulate_throw(
        speed: f32, dir_x: f32, dir_y: f32, dir_z: f32,
        spin: f32, nose: f32, hyzer: f32, forehand: bool,
    ) -> (f32, f32, f32, f32) {  // (distance_z, max_height, flight_time, final_spin)
        let profile = default_ultimate_disc();
        let wind = wind::WindField::new(0.0, 0.0);
        let dir = Vec3::new(dir_x, dir_y, dir_z).normalize();

        // Replicate throw_disc orientation logic
        let yaw = (-dir.z).atan2(dir.x);
        let mut orientation = Quat::from_axis_angle(Vec3::new(0.0, 1.0, 0.0), yaw);
        let hmag = (dir.x * dir.x + dir.z * dir.z).sqrt();
        let vel_pitch = dir.y.atan2(hmag);
        let pitch_axis = orientation.rotate_vec(Vec3::new(0.0, 0.0, 1.0));
        orientation = Quat::from_axis_angle(pitch_axis, vel_pitch + nose) * orientation;
        let roll_axis = orientation.rotate_vec(Vec3::new(1.0, 0.0, 0.0));
        orientation = Quat::from_axis_angle(roll_axis, hyzer) * orientation;
        let spin_y = if forehand { -spin } else { spin };

        let mut state = DiscState {
            position: Vec3::new(0.0, 1.5, 0.0),
            velocity: dir * speed,
            orientation,
            spin: Vec3::new(0.0, spin_y, 0.0),
            grounded: false,
        };

        let mut max_y: f32 = 0.0;
        let mut steps = 0u32;
        while !state.grounded && steps < 12000 {
            let w = wind.sample(state.position);
            integration::step(&mut state, DT, &profile, w);
            ground::check_ground(&mut state);
            if state.position.y > max_y { max_y = state.position.y; }
            steps += 1;
        }

        (state.position.z, max_y, steps as f32 / 240.0, state.spin.y.abs())
    }

    // ===== Quaternion math tests =====

    #[test]
    fn test_quat_identity_rotation() {
        let q = Quat::identity();
        let v = Vec3::new(1.0, 2.0, 3.0);
        let r = q.rotate_vec(v);
        assert!((r.x - v.x).abs() < 1e-6);
        assert!((r.y - v.y).abs() < 1e-6);
        assert!((r.z - v.z).abs() < 1e-6);
    }

    #[test]
    fn test_quat_90_deg_y_rotation() {
        // R_y(π/2) should map (1,0,0) → (0,0,-1)
        let q = Quat::from_axis_angle(Vec3::new(0.0, 1.0, 0.0), std::f32::consts::FRAC_PI_2);
        let v = q.rotate_vec(Vec3::new(1.0, 0.0, 0.0));
        assert!((v.x).abs() < 1e-5, "x should be ~0, got {}", v.x);
        assert!((v.y).abs() < 1e-5, "y should be ~0, got {}", v.y);
        assert!((v.z + 1.0).abs() < 1e-5, "z should be ~-1, got {}", v.z);
    }

    #[test]
    fn test_quat_normalize() {
        let q = Quat::new(2.0, 0.0, 0.0, 0.0).normalize();
        assert!((q.w - 1.0).abs() < 1e-6);
    }

    // ===== Yaw alignment tests =====

    #[test]
    fn test_yaw_aligns_disc_with_throw_direction() {
        // Throw along +Z: disc forward (+X body) should point along +Z world
        let dir = Vec3::new(0.0, 0.0, 1.0);
        let yaw = (-dir.z).atan2(dir.x);
        let q = Quat::from_axis_angle(Vec3::new(0.0, 1.0, 0.0), yaw);
        let forward = q.rotate_vec(Vec3::new(1.0, 0.0, 0.0));
        assert!((forward.x).abs() < 1e-5, "forward.x should be ~0, got {}", forward.x);
        assert!((forward.z - 1.0).abs() < 1e-5, "forward.z should be ~1, got {}", forward.z);
    }

    #[test]
    fn test_yaw_diagonal_direction() {
        // Throw at 45 degrees between +X and +Z
        let dir = Vec3::new(1.0, 0.0, 1.0).normalize();
        let yaw = (-dir.z).atan2(dir.x);
        let q = Quat::from_axis_angle(Vec3::new(0.0, 1.0, 0.0), yaw);
        let forward = q.rotate_vec(Vec3::new(1.0, 0.0, 0.0));
        assert!((forward.x - dir.x).abs() < 1e-4, "forward.x={}, expected {}", forward.x, dir.x);
        assert!((forward.z - dir.z).abs() < 1e-4, "forward.z={}, expected {}", forward.z, dir.z);
    }

    // ===== AoA tests =====

    #[test]
    fn test_aoa_zero_when_aligned() {
        // Disc facing +Z, velocity +Z → AoA should be ~0
        let dir = Vec3::new(0.0, 0.0, 1.0);
        let yaw = (-dir.z).atan2(dir.x);
        let q = Quat::from_axis_angle(Vec3::new(0.0, 1.0, 0.0), yaw);
        let state = DiscState {
            position: Vec3::zero(),
            velocity: Vec3::new(0.0, 0.0, 20.0),
            orientation: q,
            spin: Vec3::zero(),
            grounded: false,
        };
        let alpha = aero::compute_aoa(&state, state.velocity);
        assert!(alpha.abs() < 0.01, "AoA should be ~0, got {}", alpha);
    }

    #[test]
    fn test_aoa_positive_when_nose_up() {
        // Disc facing +Z, velocity +Z with slight downward → positive AoA
        let dir = Vec3::new(0.0, 0.0, 1.0);
        let yaw = (-dir.z).atan2(dir.x);
        let q = Quat::from_axis_angle(Vec3::new(0.0, 1.0, 0.0), yaw);
        // Add nose-up pitch
        let pitch_axis = q.rotate_vec(Vec3::new(0.0, 0.0, 1.0));
        let q_pitched = Quat::from_axis_angle(pitch_axis, 0.1) * q;
        let state = DiscState {
            position: Vec3::zero(),
            velocity: Vec3::new(0.0, 0.0, 20.0),
            orientation: q_pitched,
            spin: Vec3::zero(),
            grounded: false,
        };
        let alpha = aero::compute_aoa(&state, state.velocity);
        assert!(alpha > 0.05, "AoA should be positive (~0.1), got {}", alpha);
    }

    #[test]
    fn test_lofted_throw_gets_lift() {
        // The critical bug test: lofted throws should get upward lift, not downforce
        let profile = default_ultimate_disc();
        let wind = Vec3::zero();

        // Create a lofted throw along +Z
        let dir = Vec3::new(0.0, 0.1, 0.995).normalize();
        let yaw = (-dir.z).atan2(dir.x);
        let mut orientation = Quat::from_axis_angle(Vec3::new(0.0, 1.0, 0.0), yaw);
        let hmag = (dir.x * dir.x + dir.z * dir.z).sqrt();
        let vel_pitch = dir.y.atan2(hmag);
        let pitch_axis = orientation.rotate_vec(Vec3::new(0.0, 0.0, 1.0));
        orientation = Quat::from_axis_angle(pitch_axis, vel_pitch + 0.03) * orientation;

        let mut state = DiscState {
            position: Vec3::new(0.0, 5.0, 0.0),
            velocity: dir * 20.0,
            orientation,
            spin: Vec3::new(0.0, 80.0, 0.0),
            grounded: false,
        };

        let vy_before = state.velocity.y;
        for _ in 0..10 {
            integration::step(&mut state, DT, &profile, wind);
        }
        let accel_y = (state.velocity.y - vy_before) / (10.0 * DT);

        // Should be positive (upward), not negative (downforce)
        assert!(accel_y > 0.0,
            "Lofted throw should get lift (accel_y > 0), got {:.1} m/s²", accel_y);
    }

    // ===== Distance scaling tests =====

    #[test]
    fn test_soft_throw_distance() {
        let (dist, _height, time, _) = simulate_throw(
            7.5, 0.0, 0.08, 0.997, 26.4, 0.023, 0.1, false,
        );
        assert!(dist > 3.0 && dist < 20.0,
            "Soft throw should go 3-20m, went {:.1}m", dist);
        assert!(time < 3.0,
            "Soft throw should land within 3s, took {:.1}s", time);
    }

    #[test]
    fn test_medium_throw_distance() {
        let (dist, _, _time, _) = simulate_throw(
            15.0, 0.0, 0.11, 0.994, 52.8, -0.004, 0.1, false,
        );
        assert!(dist > 20.0 && dist < 45.0,
            "Medium throw should go 20-45m, went {:.1}m", dist);
    }

    #[test]
    fn test_full_power_distance() {
        let (dist, height, time, _) = simulate_throw(
            25.0, 0.0, 0.15, 0.989, 88.0, -0.04, 0.1, false,
        );
        assert!(dist > 40.0 && dist < 80.0,
            "Full power throw should go 40-80m, went {:.1}m", dist);
        assert!(height > 3.0 && height < 10.0,
            "Full power max height should be 3-10m, was {:.1}m", height);
        assert!(time > 3.0 && time < 8.0,
            "Full power flight time should be 3-8s, was {:.1}s", time);
    }

    #[test]
    fn test_pull_distance() {
        let (dist, _, _time, _) = simulate_throw(
            30.0, 0.02, 0.10, 0.99, 100.0, -0.04, 0.15, false,
        );
        assert!(dist > 50.0 && dist < 90.0,
            "Pull should go 50-90m, went {:.1}m", dist);
    }

    #[test]
    fn test_distance_scales_with_speed() {
        let (d1, _, _, _) = simulate_throw(10.0, 0.0, 0.08, 0.997, 40.0, 0.02, 0.1, false);
        let (d2, _, _, _) = simulate_throw(20.0, 0.0, 0.10, 0.995, 70.0, -0.02, 0.1, false);
        let (d3, _, _, _) = simulate_throw(30.0, 0.0, 0.10, 0.995, 100.0, -0.04, 0.1, false);
        assert!(d1 < d2 && d2 < d3,
            "Distance should increase with speed: {:.1} < {:.1} < {:.1}", d1, d2, d3);
    }

    // ===== Spin decay tests =====

    #[test]
    fn test_spin_retention() {
        let profile = default_ultimate_disc();
        let wind = Vec3::zero();

        let dir = Vec3::new(0.0, 0.0, 1.0);
        let yaw = (-dir.z).atan2(dir.x);
        let q = Quat::from_axis_angle(Vec3::new(0.0, 1.0, 0.0), yaw);

        let mut state = DiscState {
            position: Vec3::new(0.0, 10.0, 0.0),  // high up to avoid ground
            velocity: Vec3::new(0.0, 0.0, 20.0),
            orientation: q,
            spin: Vec3::new(0.0, 80.0, 0.0),
            grounded: false,
        };

        // Simulate 3 seconds
        for _ in 0..(240 * 3) {
            integration::step(&mut state, DT, &profile, wind);
        }

        let retention = state.spin.y.abs() / 80.0;
        assert!(retention > 0.50,
            "Spin should retain >50% after 3s, retained {:.0}%", retention * 100.0);
        assert!(retention < 0.98,
            "Spin should decay somewhat, retained {:.0}%", retention * 100.0);
    }

    // ===== Ground contact tests =====

    #[test]
    fn test_ground_stops_disc() {
        let mut state = DiscState {
            position: Vec3::new(0.0, 0.5, 0.0),
            velocity: Vec3::new(0.0, -5.0, 10.0),
            orientation: Quat::identity(),
            spin: Vec3::zero(),
            grounded: false,
        };

        ground::check_ground(&mut state);
        assert!(!state.grounded, "Disc above ground should not be grounded");

        state.position.y = -0.1;
        state.velocity.y = -3.0;
        ground::check_ground(&mut state);
        assert!(state.grounded, "Disc below ground with downward velocity should be grounded");
        assert!((state.position.y).abs() < 0.01, "Grounded disc should be at y=0");
    }

    // ===== Aerodynamic force direction tests =====

    #[test]
    fn test_lift_is_upward() {
        let profile = default_ultimate_disc();
        let dir = Vec3::new(0.0, 0.0, 1.0);
        let yaw = (-dir.z).atan2(dir.x);
        let q = Quat::from_axis_angle(Vec3::new(0.0, 1.0, 0.0), yaw);
        // Add slight nose-up for positive AoA
        let pitch_axis = q.rotate_vec(Vec3::new(0.0, 0.0, 1.0));
        let q_pitched = Quat::from_axis_angle(pitch_axis, 0.05) * q;

        let state = DiscState {
            position: Vec3::new(0.0, 5.0, 0.0),
            velocity: Vec3::new(0.0, 0.0, 20.0),
            orientation: q_pitched,
            spin: Vec3::new(0.0, 80.0, 0.0),
            grounded: false,
        };
        let v_rel = state.velocity;
        let alpha = aero::compute_aoa(&state, v_rel);
        let lift = aero::compute_lift(&state, v_rel, alpha, &profile);

        assert!(lift.y > 0.0, "Lift should be upward, got y={:.3}", lift.y);
        assert!(lift.y > 1.0, "Lift magnitude should be significant, got {:.3}N", lift.y);
    }

    #[test]
    fn test_drag_opposes_velocity() {
        let profile = default_ultimate_disc();
        let state = DiscState {
            position: Vec3::new(0.0, 5.0, 0.0),
            velocity: Vec3::new(0.0, 0.0, 20.0),
            orientation: Quat::identity(),
            spin: Vec3::zero(),
            grounded: false,
        };
        let drag = aero::compute_drag(&state, state.velocity, 0.1, &profile);
        assert!(drag.z < 0.0, "Drag should oppose +Z velocity, got z={:.3}", drag.z);
    }

    // ===== Wind tests =====

    #[test]
    fn test_wind_field_direction() {
        let w = wind::WindField::new(5.0, 0.0); // wind in +Z direction
        let sample = w.sample(Vec3::new(0.0, 10.0, 0.0));
        assert!(sample.z > 3.0, "Wind at height should have +Z component, got {:.2}", sample.z);
        assert!(sample.x.abs() < 0.5, "Wind in Z direction should have ~0 X, got {:.2}", sample.x);
    }

    #[test]
    fn test_wind_height_gradient() {
        let w = wind::WindField::new(5.0, 0.0);
        let low = w.sample(Vec3::new(0.0, 1.0, 0.0)).length();
        let high = w.sample(Vec3::new(0.0, 20.0, 0.0)).length();
        assert!(high > low, "Wind should be stronger at height: {:.2} vs {:.2}", high, low);
    }
}
