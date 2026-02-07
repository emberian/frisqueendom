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
        // Start with yaw (horizontal aim)
        let yaw = dir_x.atan2(dir_z);
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
