# Disc Physics Simulation

This is the crown jewel of FrisQueendom. The disc flight model must be physically authentic enough that experienced throwers recognize the behavior, while remaining computationally tractable for real-time browser simulation.

## Overview

The disc is simulated as a 6-DOF (six degrees of freedom) rigid body under the influence of:
- Gravitational force
- Aerodynamic forces (lift, drag, side force)
- Aerodynamic moments (pitching, rolling, yawing/spin-down)
- Gyroscopic effects (precession from angular momentum)
- Wind field interaction
- Ground effect (near-surface lift enhancement)

## Coordinate System

### World Frame (Right-Handed)
- **X**: Across the field (sideline to sideline)
- **Y**: Up (vertical)
- **Z**: Along the field (endzone to endzone)

### Disc Body Frame
- **x_b**: Forward (direction the disc's "nose" points)
- **y_b**: Up (normal to the disc's top surface)
- **z_b**: Right (completes right-handed system)

The disc's orientation is tracked via a **unit quaternion** to avoid gimbal lock.

## State Vector

The disc state at any instant is a 13-element vector:

```
State = {
  position:     [x, y, z]          // meters
  velocity:     [vx, vy, vz]       // m/s (world frame)
  orientation:  [qw, qx, qy, qz]  // unit quaternion
  spin:         [wx, wy, wz]       // rad/s (body frame angular velocity)
}
```

For a typical ultimate disc:
- `wy` (axial spin) dominates at ~60-120 rad/s (10-20 rev/s)
- `wx` and `wz` (wobble) are initially near zero for a clean throw

## Disc Parameters

```rust
struct DiscProfile {
    mass: f32,              // kg (0.175 for regulation ultimate disc)
    diameter: f32,          // m (0.273 for regulation)
    area: f32,              // m^2 (pi * r^2 = 0.0585)
    thickness: f32,         // m (~0.03)

    // Moments of inertia (kg*m^2)
    I_axial: f32,           // About spin axis (y_b), ~0.00235
    I_pitch: f32,           // About pitch axis (z_b), ~0.00122
    I_roll: f32,            // About roll axis (x_b), ~0.00122

    // Aerodynamic profile (defines the disc's "character")
    cl_0: f32,              // Lift coefficient at zero AoA (~0.15)
    cl_alpha: f32,          // Lift slope (dCL/d_alpha, ~3.0 per rad)
    cl_max: f32,            // Maximum lift coefficient (~1.2)
    alpha_stall: f32,       // Stall angle of attack (~45 deg)

    cd_0: f32,              // Parasitic drag coefficient (~0.08)
    cd_alpha: f32,          // Induced drag factor (~2.0)

    cm_0: f32,              // Pitching moment at zero AoA (~-0.02)
    cm_alpha: f32,          // Pitching moment slope (~0.015 per deg)

    spin_decay: f32,        // Spin-down rate factor (~0.0005)

    // Optional: flight number system (borrowed from disc golf)
    // Useful for creating distinct disc "feels" if we add multiple discs
    speed: f32,             // How fast you need to throw for intended flight
    glide: f32,             // How well the disc maintains loft
    turn: f32,              // High-speed understability (negative = turns right for RHBH)
    fade: f32,              // Low-speed overstability (positive = fades left for RHBH)
}
```

## Aerodynamic Forces

### Relative Velocity

The disc's velocity relative to the air (accounting for wind):

```
v_rel = v_disc - v_wind(position)
v_air = |v_rel|
v_air_safe = max(v_air, 0.5)   // avoid divide-by-zero at near-rest speeds
```

### Angle of Attack (AoA)

The angle between the disc's plane and its velocity vector through the air:

```
// Project air velocity onto disc body frame
v_body = rotate(v_rel, inverse(orientation))

// AoA is the angle between velocity and disc plane
alpha = atan2(-v_body.y, sqrt(v_body.x^2 + v_body.z^2))
```

### Sideslip Angle

```
beta = atan2(v_body.z, v_body.x)
```

### Lift Force

Perpendicular to the relative velocity, in the plane containing the disc normal and velocity:

```
CL = cl_0 + cl_alpha * alpha                   // Linear region
CL = min(CL, cl_max)                           // Clamp at stall
CL = CL * smoothstep(alpha_stall, alpha, 0.8)  // Gradual stall falloff

F_lift_magnitude = 0.5 * rho * v_air^2 * area * CL

// Lift direction: perpendicular to velocity, toward disc top
lift_dir = normalize(cross(v_rel, cross(disc_up, v_rel)))
F_lift = F_lift_magnitude * lift_dir
```

Where `rho` is air density (~1.225 kg/m^3).

### Drag Force

Opposing the relative velocity:

```
CD = cd_0 + cd_alpha * alpha^2    // Quadratic drag polar

F_drag_magnitude = 0.5 * rho * v_air^2 * area * CD
F_drag = -F_drag_magnitude * normalize(v_rel)
```

### Side Force

Small lateral force due to asymmetric airflow (from spin and sideslip):

```
CS = 0.1 * beta + 0.001 * spin.y * diameter / (2 * v_air_safe)  // Magnus-like
F_side = 0.5 * rho * v_air^2 * area * CS * disc_right
```

## Aerodynamic Moments

### Pitching Moment

The tendency of the disc to nose up or down:

```
CM = cm_0 + cm_alpha * alpha

M_pitch = 0.5 * rho * v_air^2 * area * diameter * CM
// Applied about the disc's z_b (pitch) axis
torque_pitch = M_pitch * disc_right
```

This is the key driver of disc behavior. For most discs, `cm_alpha > 0`, meaning as AoA increases, the pitching moment pushes the nose further up. Combined with gyroscopic precession, this is what causes **fade** (the disc's late-flight hook).

### Roll Moment (Damping)

Aerodynamic damping of roll oscillations:

```
C_roll = -0.005 * (spin.x * diameter) / (2 * v_air_safe)
M_roll = 0.5 * rho * v_air^2 * area * diameter * C_roll
torque_roll = M_roll * disc_forward
```

### Spin-Down Torque

Aerodynamic drag on the spinning disc:

```
torque_spindown = -spin_decay * spin.y * v_air * disc_up
```

This is crucial -- as spin decays, the disc becomes less gyroscopically stable, causing it to respond more dramatically to pitching moments. This is why discs **fade harder at the end of flight**.

## Gyroscopic Precession

This is what makes disc flight *disc flight*. The spinning disc acts as a gyroscope. When an external torque (the pitching moment) is applied, the disc doesn't pitch -- it **rolls**.

```
// Angular momentum vector (dominated by axial spin)
L = I_axial * spin.y * disc_up + I_pitch * spin.x * disc_forward + I_roll * spin.z * disc_right

// External torque (primarily pitching moment)
tau = torque_pitch + torque_roll + torque_spindown

// Euler's equation for rigid body rotation:
// dL/dt = tau
// But because we're in the body frame:
// I * d(omega)/dt + omega x (I * omega) = tau

// The cross product term is the gyroscopic precession:
precession = cross(spin, I * spin) / I

// This means a pitching moment (about z_b) with spin about y_b
// creates a ROLL change (about x_b):
// d(spin.x)/dt += (I_axial - I_pitch) * spin.y * spin.z / I_roll + tau.x / I_roll
```

### What This Means for Gameplay

For a **right-hand backhand (RHBH)** throw (disc spins clockwise when viewed from above):

1. **Early flight**: Disc has lots of spin. Pitching moment is small. Disc flies relatively straight with slight turn (right for understable disc).

2. **Mid flight**: As AoA increases due to lift-induced pitch-up, pitching moment grows. Gyroscopic precession converts this pitch-up into a roll toward the left (anhyzer → flat → hyzer).

3. **Late flight**: Spin has decayed significantly. Gyroscopic stability is low. Pitching moment now causes rapid roll to hyzer. The disc **fades** hard left and drops.

For a **forehand (flick)** throw, the disc spins counter-clockwise (viewed from above), so the fade direction is **reversed** -- the disc fades right.

This creates natural asymmetry between forehand and backhand that mirrors real ultimate and is a core strategic element.

## Integration

Use **4th-order Runge-Kutta** integration for accuracy:

```rust
fn step(state: &DiscState, dt: f32, wind: &WindField) -> DiscState {
    let k1 = derivatives(state, wind);
    let k2 = derivatives(&state.advance(k1, dt/2), wind);
    let k3 = derivatives(&state.advance(k2, dt/2), wind);
    let k4 = derivatives(&state.advance(k3, dt), wind);

    state.advance((k1 + 2*k2 + 2*k3 + k4) / 6, dt)
}

fn derivatives(state: &DiscState, wind: &WindField) -> DiscDerivatives {
    let v_rel = state.velocity - wind.sample(state.position);
    let (alpha, beta) = compute_angles(state, v_rel);

    let f_gravity = Vec3::new(0.0, -9.81 * state.mass, 0.0);
    let f_lift = compute_lift(state, v_rel, alpha);
    let f_drag = compute_drag(state, v_rel, alpha);
    let f_side = compute_side_force(state, v_rel, beta);
    let f_ground = compute_ground_effect(state, v_rel, alpha);

    let f_total = f_gravity + f_lift + f_drag + f_side + f_ground;

    let tau = compute_torques(state, v_rel, alpha, beta);
    let spin_deriv = compute_spin_derivatives(state, tau); // Includes precession

    DiscDerivatives {
        d_position: state.velocity,
        d_velocity: f_total / state.mass,
        d_orientation: quaternion_derivative(state.orientation, state.spin),
        d_spin: spin_deriv,
    }
}
```

### Timestep

Physics should run at a **fixed timestep** of 1/240s (240 Hz) or higher, decoupled from rendering framerate. At 60fps, this means 4 physics substeps per frame. For very fast throws, consider adaptive substep counts.

### Determinism Requirements

For replay and competitive integrity, the disc simulation is hard-deterministic:
- Same initial state + same wind samples + same throw inputs must produce identical state per tick.
- No frame-time-scaled randomness or wall-clock access inside physics.
- Physics updates are keyed by integer tick index (`tick += 1` at each `dt` step).

## Ground Effect

When the disc is within ~1 disc diameter of the ground, lift increases due to ground effect:

```
ground_factor = 1.0 + 0.5 * max(0, 1 - height / (2 * diameter))
F_lift *= ground_factor
```

This creates the satisfying "cushion" effect when a disc floats just above the grass.

## Disc-Ground Interaction

When the disc contacts the ground:

1. **Flat landing** (low AoA, low vertical speed): Disc skips/slides. Apply friction, reduce vertical velocity with restitution coefficient ~0.3.

2. **Edge catch** (disc edge hits ground): Disc rolls/cartwheels. Apply impulse based on contact point relative to center of mass.

3. **Nose-in** (steep angle): Disc sticks in the ground. Dramatic animation opportunity.

4. **Skip shot** (intentional): A deliberate throw aimed at the ground at a shallow angle. The disc bounces up at a predictable angle. This is a real throw in ultimate and should be simulated correctly.

## Catching

A catch is detected when:
1. A player's hand collides with the disc
2. The relative velocity between hand and disc is below a threshold (otherwise it's a drop/handblock)
3. The player is in a valid catching pose (not mid-throw, etc.)

The catch difficulty is modulated by:
- Disc speed at contact (faster = harder to catch)
- Disc spin at contact (more spin = harder to control)
- Angle of approach (edge-on is harder than flat)
- Player stats (catching ability)
- Whether it's a layout/dive catch (harder but spectacular)

## Throw Release Parameters

When a player throws, the disc is initialized with:

```rust
struct ThrowRelease {
    speed: f32,          // m/s, typically 10-30
    direction: Vec3,     // unit vector, world frame
    spin_rate: f32,      // rad/s, typically 60-120
    spin_axis: Vec3,     // unit vector (near disc_up for clean throw)
    nose_angle: f32,     // rad, angle of disc nose relative to velocity
    hyzer_angle: f32,    // rad, roll angle (positive = hyzer for RHBH)
    release_height: f32, // m, height above ground
    off_axis: f32,       // rad, wobble (0 = clean release, >0 = wobbly)
}
```

The relationship between player input and these parameters is defined in `04-THROW-MECHANICS.md`.

## Aerodynamic Coefficient Lookup

Rather than purely analytical coefficients, use lookup tables derived from wind tunnel data (published research on disc aerodynamics). Interpolate between table entries:

```rust
struct AeroTable {
    // Indexed by angle of attack in 1-degree increments, -10 to +90
    alpha_entries: Vec<f32>,
    cl_table: Vec<f32>,
    cd_table: Vec<f32>,
    cm_table: Vec<f32>,
}

impl AeroTable {
    fn sample(&self, alpha: f32) -> (f32, f32, f32) {
        let idx = (alpha.to_degrees() + 10.0).clamp(0.0, 100.0);
        let lo = idx.floor() as usize;
        let hi = (lo + 1).min(self.alpha_entries.len() - 1);
        let t = idx.fract();

        let cl = lerp(self.cl_table[lo], self.cl_table[hi], t);
        let cd = lerp(self.cd_table[lo], self.cd_table[hi], t);
        let cm = lerp(self.cm_table[lo], self.cm_table[hi], t);

        (cl, cd, cm)
    }
}
```

Reference data sources:
- Potts & Crowther (2002): "Disc Flight Dynamics" (University of Manchester)
- Hummel (2003): "Frisbee Flight Simulation and Throw Biomechanics" (UC Davis)
- Lorenz (2006): "Flight and Attitude Dynamics Measurements of a Frisbee" (Johns Hopkins APL)

## Implementation Notes

### Rust Crate (`frisque-physics`)

The physics simulation is implemented as a standalone Rust crate that compiles to WASM for the browser and native for FrisKingdom. The crate exposes:

```rust
pub struct DiscSim {
    state: DiscState,
    profile: DiscProfile,
    aero_table: AeroTable,
}

impl DiscSim {
    pub fn new(profile: DiscProfile) -> Self;
    pub fn throw(&mut self, release: ThrowRelease);
    pub fn step(&mut self, dt: f32, wind: &WindSample);
    pub fn state(&self) -> &DiscState;
    pub fn is_grounded(&self) -> bool;
    pub fn trajectory_predict(&self, wind: &WindField, duration: f32, steps: usize) -> Vec<Vec3>;
}
```

### Performance Budget

Per disc per frame (at 60fps with 4 substeps):
- ~4 force evaluations (RK4)
- ~4 quaternion operations
- ~4 wind field samples
- Total: ~200 floating point operations per substep, ~800 per frame per disc
- With 1 disc in flight: trivial
- With trajectory prediction (60-step preview): ~12,000 ops -- still trivial for WASM

The wind field sampling is the expensive part and is covered in `03-WIND-SYSTEM.md`.

### Debugging / Visualization

For development, expose debug visualization:
- Disc orientation axes (RGB arrows)
- Velocity vector (yellow arrow)
- Lift/drag/side force vectors (colored arrows, scaled)
- Trajectory prediction curve (dotted line)
- AoA and spin rate readouts
- Wind at disc position (blue arrow)
- Ground effect zone (translucent circle under disc)

This is invaluable for tuning and also makes for a killer "nerd mode" overlay for physics enthusiasts playing the game.

## Tuning Philosophy

The physics should be correct first, then tuned for game feel. Specific tuning knobs:

1. **Time scale**: Slight slow-motion during key moments (throw release, catch) for dramatic effect without changing physics
2. **Assist**: Subtle trajectory correction for beginners (reduce off-axis wobble, soften wind effects) -- optional accessibility setting
3. **Exaggeration**: The fade curve can be slightly exaggerated from real life to make throw selection more strategic
4. **Spin visibility**: The disc's rotation should be visible even at game camera distances -- may need to exaggerate disc diameter or add visual trails

The goal: a physics engine that a disc flight dynamics PhD would approve of, in a game that a 10-year-old would enjoy.
