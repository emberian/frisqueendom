use std::ops::{Add, Sub, Mul, Neg};

#[derive(Copy, Clone, Debug)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vec3 {
    pub fn new(x: f32, y: f32, z: f32) -> Self {
        Vec3 { x, y, z }
    }

    pub fn zero() -> Self {
        Vec3 { x: 0.0, y: 0.0, z: 0.0 }
    }

    pub fn dot(self, other: Vec3) -> f32 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    pub fn cross(self, other: Vec3) -> Vec3 {
        Vec3 {
            x: self.y * other.z - self.z * other.y,
            y: self.z * other.x - self.x * other.z,
            z: self.x * other.y - self.y * other.x,
        }
    }

    pub fn length_sq(self) -> f32 {
        self.dot(self)
    }

    pub fn length(self) -> f32 {
        self.length_sq().sqrt()
    }

    pub fn normalize(self) -> Vec3 {
        let len = self.length();
        if len < 1e-10 {
            Vec3::zero()
        } else {
            self * (1.0 / len)
        }
    }

    pub fn lerp(self, other: Vec3, t: f32) -> Vec3 {
        self * (1.0 - t) + other * t
    }
}

impl Add for Vec3 {
    type Output = Vec3;
    fn add(self, rhs: Vec3) -> Vec3 {
        Vec3::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z)
    }
}

impl Sub for Vec3 {
    type Output = Vec3;
    fn sub(self, rhs: Vec3) -> Vec3 {
        Vec3::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z)
    }
}

impl Mul<f32> for Vec3 {
    type Output = Vec3;
    fn mul(self, rhs: f32) -> Vec3 {
        Vec3::new(self.x * rhs, self.y * rhs, self.z * rhs)
    }
}

impl Neg for Vec3 {
    type Output = Vec3;
    fn neg(self) -> Vec3 {
        Vec3::new(-self.x, -self.y, -self.z)
    }
}

#[derive(Copy, Clone, Debug)]
pub struct Quat {
    pub w: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Quat {
    pub fn new(w: f32, x: f32, y: f32, z: f32) -> Self {
        Quat { w, x, y, z }
    }

    pub fn identity() -> Self {
        Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }
    }

    pub fn from_axis_angle(axis: Vec3, angle: f32) -> Self {
        let half = angle * 0.5;
        let s = half.sin();
        let a = axis.normalize();
        Quat {
            w: half.cos(),
            x: a.x * s,
            y: a.y * s,
            z: a.z * s,
        }
    }

    pub fn normalize(self) -> Quat {
        let len = (self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z).sqrt();
        if len < 1e-10 {
            Quat::identity()
        } else {
            let inv = 1.0 / len;
            Quat {
                w: self.w * inv,
                x: self.x * inv,
                y: self.y * inv,
                z: self.z * inv,
            }
        }
    }

    pub fn conjugate(self) -> Quat {
        Quat {
            w: self.w,
            x: -self.x,
            y: -self.y,
            z: -self.z,
        }
    }

    pub fn rotate_vec(self, v: Vec3) -> Vec3 {
        // q * v * q^-1 using optimized formula
        let qv = Vec3::new(self.x, self.y, self.z);
        let uv = qv.cross(v);
        let uuv = qv.cross(uv);
        v + (uv * self.w + uuv) * 2.0
    }

    pub fn mul(self, other: Quat) -> Quat {
        Quat {
            w: self.w * other.w - self.x * other.x - self.y * other.y - self.z * other.z,
            x: self.w * other.x + self.x * other.w + self.y * other.z - self.z * other.y,
            y: self.w * other.y - self.x * other.z + self.y * other.w + self.z * other.x,
            z: self.w * other.z + self.x * other.y - self.y * other.x + self.z * other.w,
        }
    }
}

impl Mul<Quat> for Quat {
    type Output = Quat;
    fn mul(self, rhs: Quat) -> Quat {
        self.mul(rhs)
    }
}

impl Add for Quat {
    type Output = Quat;
    fn add(self, rhs: Quat) -> Quat {
        Quat::new(self.w + rhs.w, self.x + rhs.x, self.y + rhs.y, self.z + rhs.z)
    }
}

impl Mul<f32> for Quat {
    type Output = Quat;
    fn mul(self, rhs: f32) -> Quat {
        Quat::new(self.w * rhs, self.x * rhs, self.y * rhs, self.z * rhs)
    }
}

/// Computes dq/dt = 0.5 * q * Quat(0, omega.x, omega.y, omega.z)
pub fn quat_derivative(q: Quat, omega: Vec3) -> Quat {
    let omega_q = Quat::new(0.0, omega.x, omega.y, omega.z);
    q.mul(omega_q) * 0.5
}

/// Weighted RK4 quaternion step
pub fn quat_step(q: Quat, k1: &Quat, k2: &Quat, k3: &Quat, k4: &Quat, dt: f32) -> Quat {
    let dq = *k1 + *k2 * 2.0 + *k3 * 2.0 + *k4;
    (q + dq * (dt / 6.0)).normalize()
}
