use crate::math::Vec3;
use crate::noise;

/// A single thermal updraft/downdraft cell
#[derive(Clone, Debug)]
pub struct Thermal {
    pub position_x: f32,
    pub position_z: f32,
    pub radius: f32,      // 5-15m
    pub strength: f32,    // 0.5-2.0 m/s vertical
    pub lifetime: f32,    // seconds until dissipation
    pub age: f32,
}

impl Thermal {
    pub fn new(x: f32, z: f32, radius: f32, strength: f32, lifetime: f32) -> Self {
        Thermal {
            position_x: x,
            position_z: z,
            radius: radius.clamp(1.0, 50.0),
            strength: strength.clamp(-5.0, 5.0),
            lifetime: lifetime.max(0.1),
            age: 0.0,
        }
    }

    /// Sample the wind contribution at a given position from this thermal.
    /// Returns a Vec3 of the wind velocity contribution.
    pub fn sample(&self, position: Vec3) -> Vec3 {
        let dx = position.x - self.position_x;
        let dz = position.z - self.position_z;
        let dist_sq = dx * dx + dz * dz;
        let dist = dist_sq.sqrt();

        // Normalized distance from center (0 at center, 1 at radius edge)
        let r_norm = dist / self.radius;

        // Beyond 1.5x radius, no contribution
        if r_norm > 1.5 {
            return Vec3::zero();
        }

        // Age-based intensity: ramp up over first 20% of lifetime, full until 80%, then fade out
        let life_frac = self.age / self.lifetime;
        let age_factor = if life_frac < 0.2 {
            life_frac / 0.2
        } else if life_frac < 0.8 {
            1.0
        } else {
            (1.0 - life_frac) / 0.2
        };

        let eff_strength = self.strength * age_factor;

        // Height-dependent: thermals are strongest near ground, weaken with altitude
        let height = position.y.max(0.0);
        let height_factor = 1.0 / (1.0 + height * 0.03); // gentle falloff

        // Toroidal flow pattern:
        // - Center (r_norm < 0.5): strong updraft
        // - Ring (0.5 < r_norm < 1.0): transition from updraft to downdraft
        // - Edge (1.0 < r_norm < 1.5): downdraft + radial outflow

        let vertical;
        let radial;

        if r_norm < 0.5 {
            // Core: strong updraft, Gaussian-like profile
            let core_factor = 1.0 - (r_norm / 0.5) * (r_norm / 0.5);
            vertical = eff_strength * core_factor * height_factor;
            radial = 0.0; // negligible radial flow at center
        } else if r_norm < 1.0 {
            // Transition zone: updraft weakens, slight radial inflow
            let t = (r_norm - 0.5) / 0.5; // 0 to 1
            let smoothstep = t * t * (3.0 - 2.0 * t);
            vertical = eff_strength * (1.0 - 2.0 * smoothstep) * height_factor;
            // Slight inward radial flow (convergence)
            radial = -eff_strength * 0.2 * smoothstep * height_factor;
        } else {
            // Edge: downdraft + radial outflow
            let t = (r_norm - 1.0) / 0.5; // 0 to 1
            let edge_falloff = 1.0 - t * t;
            vertical = -eff_strength * 0.5 * edge_falloff * height_factor;
            // Outward radial flow
            radial = eff_strength * 0.3 * edge_falloff * height_factor;
        }

        // Convert radial component to world XZ
        let mut result = Vec3::new(0.0, vertical, 0.0);
        if dist > 0.01 {
            let dir_x = dx / dist;
            let dir_z = dz / dist;
            result.x += radial * dir_x;
            result.z += radial * dir_z;
        }

        result
    }
}

pub struct WindField {
    pub base_speed: f32,
    pub base_direction: f32,
    pub time: f32,
    pub turbulence_intensity: f32,
    pub thermals: Vec<Thermal>,
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
            thermals: Vec::new(),
        }
    }

    /// Add a thermal at the given world position
    pub fn add_thermal(&mut self, x: f32, z: f32, radius: f32, strength: f32, lifetime: f32) {
        self.thermals.push(Thermal::new(x, z, radius, strength, lifetime));
    }

    /// Update thermals: age them and remove expired ones
    pub fn update_thermals(&mut self, dt: f32) {
        for thermal in &mut self.thermals {
            thermal.age += dt;
        }
        self.thermals.retain(|t| t.age < t.lifetime);
    }

    pub fn update(&mut self, dt: f32) {
        self.time += dt;
        self.update_thermals(dt);
    }

    pub fn sample(&self, position: Vec3) -> Vec3 {
        let mut result = self.sample_base_wind(position);

        // Add thermal contributions
        for thermal in &self.thermals {
            result = result + thermal.sample(position);
        }

        result
    }

    /// Sample just the base wind (no thermals) - original behavior
    fn sample_base_wind(&self, position: Vec3) -> Vec3 {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thermal_updraft_at_center() {
        let thermal = Thermal::new(0.0, 0.0, 10.0, 2.0, 10.0);
        // Set age to mid-life for full strength
        let mut t = thermal;
        t.age = 5.0;

        let wind = t.sample(Vec3::new(0.0, 1.0, 0.0));
        assert!(wind.y > 1.0,
            "Thermal center should have strong updraft, got y={:.3}", wind.y);
        assert!(wind.x.abs() < 0.01 && wind.z.abs() < 0.01,
            "Thermal center should have no radial flow");
    }

    #[test]
    fn test_thermal_downdraft_at_edge() {
        let mut thermal = Thermal::new(0.0, 0.0, 10.0, 2.0, 10.0);
        thermal.age = 5.0;

        // Sample at 1.2x radius (edge zone)
        let wind = thermal.sample(Vec3::new(12.0, 1.0, 0.0));
        assert!(wind.y < 0.0,
            "Thermal edge should have downdraft, got y={:.3}", wind.y);
    }

    #[test]
    fn test_thermal_radial_outflow_at_edge() {
        let mut thermal = Thermal::new(0.0, 0.0, 10.0, 2.0, 10.0);
        thermal.age = 5.0;

        // Sample at 1.2x radius along +X
        let wind = thermal.sample(Vec3::new(12.0, 1.0, 0.0));
        assert!(wind.x > 0.0,
            "Edge along +X should have outward radial flow, got x={:.3}", wind.x);
    }

    #[test]
    fn test_thermal_no_effect_far_away() {
        let mut thermal = Thermal::new(0.0, 0.0, 10.0, 2.0, 10.0);
        thermal.age = 5.0;

        // Sample at 2x radius (beyond range)
        let wind = thermal.sample(Vec3::new(20.0, 1.0, 0.0));
        assert!(wind.length() < 0.01,
            "Far from thermal should have no wind, got {:.3}", wind.length());
    }

    #[test]
    fn test_thermal_age_rampup() {
        let mut thermal = Thermal::new(0.0, 0.0, 10.0, 2.0, 10.0);

        // At age 0, should be zero (just starting)
        thermal.age = 0.0;
        let w0 = thermal.sample(Vec3::new(0.0, 1.0, 0.0));

        // At age 1.0 (10% of lifetime), partial ramp
        thermal.age = 1.0;
        let w1 = thermal.sample(Vec3::new(0.0, 1.0, 0.0));

        // At age 5.0 (mid-life), full strength
        thermal.age = 5.0;
        let w5 = thermal.sample(Vec3::new(0.0, 1.0, 0.0));

        assert!(w0.y < w1.y, "Thermal should ramp up: age0={:.3} < age1={:.3}", w0.y, w1.y);
        assert!(w1.y < w5.y, "Thermal should strengthen: age1={:.3} < age5={:.3}", w1.y, w5.y);
    }

    #[test]
    fn test_thermal_age_fadeout() {
        let mut thermal = Thermal::new(0.0, 0.0, 10.0, 2.0, 10.0);

        // At mid-life
        thermal.age = 5.0;
        let w_mid = thermal.sample(Vec3::new(0.0, 1.0, 0.0));

        // Near end of life
        thermal.age = 9.5;
        let w_end = thermal.sample(Vec3::new(0.0, 1.0, 0.0));

        assert!(w_mid.y > w_end.y,
            "Thermal should fade out: mid={:.3} > end={:.3}", w_mid.y, w_end.y);
    }

    #[test]
    fn test_thermal_despawn() {
        let mut wind = WindField::new(0.0, 0.0);
        wind.add_thermal(0.0, 0.0, 10.0, 2.0, 5.0);
        assert_eq!(wind.thermals.len(), 1);

        // Age past lifetime
        wind.update_thermals(6.0);
        assert_eq!(wind.thermals.len(), 0, "Expired thermal should be removed");
    }

    #[test]
    fn test_thermal_contributes_to_wind_sample() {
        let mut wind = WindField::new(0.0, 0.0); // no base wind
        wind.add_thermal(0.0, 0.0, 10.0, 2.0, 10.0);
        wind.thermals[0].age = 5.0; // mid-life

        let sample = wind.sample(Vec3::new(0.0, 1.0, 0.0));
        assert!(sample.y > 1.0,
            "Wind sample should include thermal updraft, got y={:.3}", sample.y);
    }
}
