use crate::math::{Vec3, Quat};

#[derive(Clone, Debug)]
pub struct DiscState {
    pub position: Vec3,
    pub velocity: Vec3,
    pub orientation: Quat,
    pub spin: Vec3,
    pub grounded: bool,
}

pub struct DiscProfile {
    pub mass: f32,
    pub diameter: f32,
    pub area: f32,
    pub i_axial: f32,
    pub i_pitch: f32,
    pub cl_0: f32,
    pub cl_alpha: f32,
    pub cl_max: f32,
    pub alpha_stall: f32,
    pub cd_0: f32,
    pub cd_alpha: f32,
    pub cm_0: f32,
    pub cm_alpha: f32,
    pub spin_decay: f32,
}

pub fn default_ultimate_disc() -> DiscProfile {
    DiscProfile {
        mass: 0.175,
        diameter: 0.273,
        area: std::f32::consts::PI * (0.273 / 2.0) * (0.273 / 2.0),
        i_axial: 0.00235,
        i_pitch: 0.00122,
        cl_0: 0.15,
        cl_alpha: 1.4,
        cl_max: 1.1,
        alpha_stall: 0.785,
        cd_0: 0.025,
        cd_alpha: 1.2,
        cm_0: -0.005,
        cm_alpha: 0.003,
        spin_decay: 0.0002,
    }
}

impl DiscState {
    pub fn new() -> Self {
        DiscState {
            position: Vec3::zero(),
            velocity: Vec3::zero(),
            orientation: Quat::identity(),
            spin: Vec3::zero(),
            grounded: true,
        }
    }

    pub fn disc_up(&self) -> Vec3 {
        self.orientation.rotate_vec(Vec3::new(0.0, 1.0, 0.0))
    }

    pub fn disc_forward(&self) -> Vec3 {
        self.orientation.rotate_vec(Vec3::new(1.0, 0.0, 0.0))
    }

    pub fn disc_right(&self) -> Vec3 {
        self.orientation.rotate_vec(Vec3::new(0.0, 0.0, 1.0))
    }
}
