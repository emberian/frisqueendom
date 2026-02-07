use crate::math::Vec3;
use crate::noise;

pub struct WindField {
    pub base_speed: f32,
    pub base_direction: f32,
    pub time: f32,
    pub turbulence_intensity: f32,
}

impl WindField {
    pub fn new(speed: f32, direction: f32) -> Self {
        let turbulence = if speed < 2.0 {
            0.3
        } else if speed < 5.0 {
            0.8
        } else {
            1.5
        };
        WindField {
            base_speed: speed,
            base_direction: direction,
            time: 0.0,
            turbulence_intensity: turbulence,
        }
    }

    pub fn update(&mut self, dt: f32) {
        self.time += dt;
    }

    pub fn sample(&self, position: Vec3) -> Vec3 {
        if self.base_speed < 0.01 {
            return Vec3::zero();
        }

        // Logarithmic wind profile: speed increases with height
        let z0: f32 = 0.01;
        let h_ref: f32 = 10.0;
        let h = position.y.max(0.1);
        let height_factor = (h / z0).ln() / (h_ref / z0).ln();

        let speed = self.base_speed * height_factor;
        let dx = speed * self.base_direction.sin();
        let dz = speed * self.base_direction.cos();
        let mut base = Vec3::new(dx, 0.0, dz);

        // 2-octave Perlin turbulence
        let scale: f32 = 0.02;
        let time_scale: f32 = 0.3;
        let mut turb = Vec3::zero();
        for octave in 0..2u32 {
            let freq = scale * (1 << octave) as f32;
            let t_freq = time_scale * (1 << octave) as f32;
            let amp = self.turbulence_intensity / (1 << octave) as f32;
            turb.x += amp * noise::perlin4d(
                position.x * freq, position.y * freq, position.z * freq,
                self.time * t_freq, 0,
            );
            turb.y += amp * 0.3 * noise::perlin4d(
                position.x * freq, position.y * freq, position.z * freq,
                self.time * t_freq, 1,
            );
            turb.z += amp * noise::perlin4d(
                position.x * freq, position.y * freq, position.z * freq,
                self.time * t_freq, 2,
            );
        }

        base.x += turb.x;
        base.y += turb.y;
        base.z += turb.z;
        base
    }
}
