use crate::disc::DiscState;
use crate::math::Vec3;

pub fn check_ground(state: &mut DiscState) -> bool {
    if state.position.y <= 0.0 && state.velocity.y <= 0.0 {
        state.position.y = 0.0;
        state.velocity = Vec3::zero();
        state.spin = Vec3::zero();
        state.grounded = true;
        return true;
    }
    false
}
