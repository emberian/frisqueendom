use crate::disc::DiscState;
use crate::math::Vec3;

/// Ground interaction result types
/// 0 = none, 1 = skip, 2 = edge_catch, 3 = nose_in, 4 = slide
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum GroundType {
    None = 0,
    Skip = 1,
    EdgeCatch = 2,
    NoseIn = 3,
    Slide = 4,
}

/// Restitution coefficient for skip shots
const RESTITUTION: f32 = 0.3;
/// Friction coefficient for sliding
const FRICTION_COEFF: f32 = 0.4;
/// Minimum speed to sustain a skip (below this, slide instead)
const MIN_SKIP_SPEED: f32 = 3.0;
/// Vertical velocity threshold below which a skip is not possible
const MIN_SKIP_VY: f32 = 0.5;
/// Maximum angle of incidence (from horizontal) for a skip shot (radians)
/// Beyond this angle, it's a nose-in
const MAX_SKIP_ANGLE: f32 = 0.78; // ~45 degrees
/// Edge catch tilt threshold: disc must be tilted significantly from horizontal
const EDGE_CATCH_TILT: f32 = 0.6; // ~34 degrees from vertical
/// Speed threshold below which ground contact → stop
const SLIDE_STOP_SPEED: f32 = 0.5;

/// Check for ground contact and determine the interaction type.
/// Returns the GroundType that occurred.
pub fn check_ground(state: &mut DiscState) -> GroundType {
    // Not touching ground
    if state.position.y > 0.0 || state.velocity.y > 0.0 {
        return GroundType::None;
    }

    // Clamp to ground level
    state.position.y = 0.0;

    let horizontal_speed = (state.velocity.x * state.velocity.x
        + state.velocity.z * state.velocity.z)
        .sqrt();
    let total_speed = state.velocity.length();
    let vert_speed = (-state.velocity.y).max(0.0); // positive downward

    // Angle of incidence from horizontal plane (0 = perfectly horizontal, pi/2 = straight down)
    let incidence_angle = if horizontal_speed > 0.01 {
        vert_speed.atan2(horizontal_speed)
    } else {
        std::f32::consts::FRAC_PI_2 // straight down
    };

    // Disc tilt: how much the disc normal deviates from vertical
    // disc_up dot world_up = cos(tilt_angle)
    let disc_up = state.disc_up();
    let tilt_cos = disc_up.y.abs(); // abs because disc could be upside down
    // tilt_cos near 1.0 = disc is flat, near 0.0 = disc is on edge

    // Determine which part of the disc hits first based on orientation
    // A disc with low tilt_cos is hitting edge-first
    let is_on_edge = tilt_cos < EDGE_CATCH_TILT.cos();

    // --- Decision logic ---

    // 1. Nose-in: steep vertical angle
    if incidence_angle > MAX_SKIP_ANGLE {
        return nose_in(state);
    }

    // 2. Edge catch: disc is tilted significantly and has enough speed
    if is_on_edge && total_speed > MIN_SKIP_SPEED {
        return edge_catch(state);
    }

    // 3. Skip: shallow angle, sufficient speed
    if horizontal_speed > MIN_SKIP_SPEED && vert_speed > MIN_SKIP_VY && incidence_angle < MAX_SKIP_ANGLE {
        return skip(state, incidence_angle);
    }

    // 4. Slide: low speed or very shallow contact
    if total_speed > SLIDE_STOP_SPEED {
        return slide(state);
    }

    // 5. Full stop
    stop(state)
}

/// Skip/bounce: disc bounces off the ground at a reflected angle with energy loss
fn skip(state: &mut DiscState, _incidence_angle: f32) -> GroundType {
    // Reflect vertical velocity with restitution loss
    state.velocity.y = (-state.velocity.y) * RESTITUTION;

    // Some horizontal speed loss from the bounce
    let horiz_loss = 0.85;
    state.velocity.x *= horiz_loss;
    state.velocity.z *= horiz_loss;

    // Reduce spin somewhat from ground impact
    state.spin = state.spin * 0.8;

    // Disc is airborne again after skip
    state.grounded = false;
    // Nudge above ground so it doesn't immediately re-trigger
    state.position.y = 0.01;

    GroundType::Skip
}

/// Edge catch: disc hits on edge, applies angular impulse for cartwheel/roll
fn edge_catch(state: &mut DiscState) -> GroundType {
    // The disc catches its edge and cartwheels.
    // Strong deceleration, angular impulse around the velocity direction.
    let speed = state.velocity.length();

    // Apply a strong angular impulse around the disc's forward axis (roll/cartwheel)
    let disc_forward = state.disc_forward();
    // The cartwheel torque direction depends on which edge caught
    let _disc_right = state.disc_right();
    let vel_dir = if speed > 0.01 {
        state.velocity.normalize()
    } else {
        disc_forward
    };

    // Determine cartwheel direction from the cross of velocity with ground normal
    let cartwheel_axis = vel_dir.cross(Vec3::new(0.0, 1.0, 0.0)).normalize();

    // Apply angular impulse: add spin around the cartwheel axis
    // Convert world-frame impulse to body frame
    let impulse_world = cartwheel_axis * speed * 2.0;
    let impulse_body = state.orientation.conjugate().rotate_vec(impulse_world);
    state.spin = state.spin + impulse_body;

    // Significant speed loss
    state.velocity = state.velocity * 0.3;
    // Bounce up slightly
    state.velocity.y = speed * 0.15;

    state.grounded = false;
    state.position.y = 0.01;

    GroundType::EdgeCatch
}

/// Nose-in: disc hits ground at steep angle, sticks immediately
fn nose_in(state: &mut DiscState) -> GroundType {
    state.velocity = Vec3::zero();
    state.spin = Vec3::zero();
    state.grounded = true;
    GroundType::NoseIn
}

/// Slide: disc is on the ground sliding with friction
fn slide(state: &mut DiscState) -> GroundType {
    // Kill vertical velocity
    state.velocity.y = 0.0;

    // Apply friction deceleration
    let horiz_speed = (state.velocity.x * state.velocity.x
        + state.velocity.z * state.velocity.z)
        .sqrt();

    if horiz_speed < SLIDE_STOP_SPEED {
        // Stop completely
        state.velocity = Vec3::zero();
        state.spin = Vec3::zero();
        state.grounded = true;
        return GroundType::Slide;
    }

    // Friction force decelerates horizontal velocity
    // Apply as an impulse per check (this is called each physics step)
    let friction_decel = FRICTION_COEFF * 9.81; // mu * g
    let dt_approx = 1.0 / 240.0; // approximate timestep
    let speed_loss = friction_decel * dt_approx;

    if speed_loss >= horiz_speed {
        state.velocity = Vec3::zero();
        state.spin = Vec3::zero();
        state.grounded = true;
    } else {
        let factor = 1.0 - speed_loss / horiz_speed;
        state.velocity.x *= factor;
        state.velocity.z *= factor;
        // Spin decays quickly on ground
        state.spin = state.spin * 0.95;
        // Disc stays on ground but is still sliding (not "grounded" in flight sense
        // until it stops)
        state.grounded = false;
        state.position.y = 0.0;
    }

    GroundType::Slide
}

/// Full stop
fn stop(state: &mut DiscState) -> GroundType {
    state.velocity = Vec3::zero();
    state.spin = Vec3::zero();
    state.grounded = true;
    GroundType::None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::Quat;

    #[test]
    fn test_skip_shot_shallow_angle() {
        // Disc approaching ground at shallow angle with good speed
        let mut state = DiscState {
            position: Vec3::new(0.0, -0.01, 20.0),
            velocity: Vec3::new(0.0, -2.0, 15.0), // shallow angle, fast horizontal
            orientation: Quat::identity(), // flat disc
            spin: Vec3::new(0.0, 60.0, 0.0),
            grounded: false,
        };

        let result = check_ground(&mut state);
        assert_eq!(result, GroundType::Skip, "Shallow angle + speed should skip");
        assert!(!state.grounded, "Disc should be airborne after skip");
        assert!(state.velocity.y > 0.0, "Vertical velocity should be upward after skip");
        assert!(state.position.y > 0.0, "Disc should be nudged above ground");
    }

    #[test]
    fn test_nose_in_steep_angle() {
        // Disc coming straight down
        let mut state = DiscState {
            position: Vec3::new(0.0, -0.01, 20.0),
            velocity: Vec3::new(0.0, -10.0, 2.0), // steep angle
            orientation: Quat::identity(),
            spin: Vec3::new(0.0, 60.0, 0.0),
            grounded: false,
        };

        let result = check_ground(&mut state);
        assert_eq!(result, GroundType::NoseIn, "Steep angle should nose-in");
        assert!(state.grounded, "Disc should be grounded after nose-in");
        assert!(state.velocity.length() < 0.01, "Velocity should be zero after nose-in");
    }

    #[test]
    fn test_edge_catch_tilted_disc() {
        // Disc on its edge with speed
        let tilt_angle = 1.2; // ~69 degrees tilt
        let orientation = Quat::from_axis_angle(Vec3::new(0.0, 0.0, 1.0), tilt_angle);
        let mut state = DiscState {
            position: Vec3::new(0.0, -0.01, 20.0),
            velocity: Vec3::new(0.0, -1.0, 10.0),
            orientation,
            spin: Vec3::new(0.0, 60.0, 0.0),
            grounded: false,
        };

        let result = check_ground(&mut state);
        assert_eq!(result, GroundType::EdgeCatch, "Tilted disc should edge catch");
        assert!(!state.grounded, "Disc should bounce after edge catch");
    }

    #[test]
    fn test_slide_low_speed() {
        // Disc at ground level with low horizontal speed
        let mut state = DiscState {
            position: Vec3::new(0.0, -0.01, 20.0),
            velocity: Vec3::new(0.0, -0.3, 2.0), // low vert, moderate horiz
            orientation: Quat::identity(),
            spin: Vec3::new(0.0, 30.0, 0.0),
            grounded: false,
        };

        let result = check_ground(&mut state);
        assert_eq!(result, GroundType::Slide, "Low speed contact should slide");
    }

    #[test]
    fn test_skip_preserves_spin_partially() {
        let mut state = DiscState {
            position: Vec3::new(0.0, -0.01, 20.0),
            velocity: Vec3::new(0.0, -2.0, 15.0),
            orientation: Quat::identity(),
            spin: Vec3::new(0.0, 80.0, 0.0),
            grounded: false,
        };

        check_ground(&mut state);
        let spin_retained = state.spin.y.abs();
        assert!(spin_retained > 50.0, "Skip should retain most spin, got {}", spin_retained);
        assert!(spin_retained < 80.0, "Skip should lose some spin, got {}", spin_retained);
    }

    #[test]
    fn test_above_ground_no_interaction() {
        let mut state = DiscState {
            position: Vec3::new(0.0, 5.0, 20.0),
            velocity: Vec3::new(0.0, -2.0, 15.0),
            orientation: Quat::identity(),
            spin: Vec3::new(0.0, 60.0, 0.0),
            grounded: false,
        };

        let result = check_ground(&mut state);
        assert_eq!(result, GroundType::None, "Above ground should have no interaction");
        assert!(!state.grounded);
    }
}
