# Wind Simulation System

Wind is a first-class game mechanic in FrisQueendom. It transforms every throw from a ballistics problem into a fluid dynamics problem. This document describes the wind field simulation, its visual representation, and the technical approach for real-time computation.

## Design Goals

1. **Physically plausible** wind behavior (not just random vectors)
2. **Visually readable** -- players must be able to "read" the wind before throwing
3. **Strategically meaningful** -- wind should change how you play, not just annoy you
4. **Performant** -- must maintain 60fps in the browser
5. **Deterministic** for a given seed -- replay consistency

## Wind Field Architecture

The wind is represented as a **3D vector field** sampled on a grid covering the playing area plus margins.

### Grid Specification

```
Field area: ~110m x 40m
Margin: 20m on each side
Total simulation area: 150m x 80m x 30m (height)

Horizontal resolution: 2m cells → 75 x 40 = 3,000 columns
Vertical layers: 6 layers (0, 1, 3, 6, 12, 25m)
Total cells: 18,000

Each cell: vec3 (12 bytes)
Total memory: ~216 KB per field snapshot
```

This is small enough to update every frame on the CPU, but we may want GPU compute for higher fidelity or for the visual grass/particle simulation that needs per-pixel wind.

### Wind Components

The wind at any point is the sum of several layers:

```
v_wind(p, t) = v_base(t)           // Prevailing wind direction + speed
             + v_gradient(p.y)      // Wind speed increases with height
             + v_turbulence(p, t)   // Turbulent fluctuations (Perlin noise)
             + v_gust(p, t)         // Discrete gust events
             + v_thermal(p, t)      // Thermal updrafts/downdrafts
             + v_obstacle(p)        // Deflection around objects (buildings, trees)
```

## Layer Details

### 1. Base Wind

The prevailing wind for the match. Set at match start, varies slowly over time.

```rust
struct BaseWind {
    direction: f32,           // radians, 0 = blowing toward +Z
    speed: f32,               // m/s, typically 0-15
    variability: f32,         // how much direction/speed wander over time
    direction_wander: f32,    // current direction offset (random walk)
    speed_wander: f32,        // current speed offset (random walk)
}

impl BaseWind {
    fn update(&mut self, dt: f32) {
        // Ornstein-Uhlenbeck process for mean-reverting random walk
        self.direction_wander += (-0.1 * self.direction_wander + self.variability * noise()) * dt;
        self.speed_wander += (-0.1 * self.speed_wander + self.variability * 0.5 * noise()) * dt;
    }

    fn sample(&self) -> Vec3 {
        let dir = self.direction + self.direction_wander;
        let spd = (self.speed + self.speed_wander).max(0.0);
        Vec3::new(spd * dir.sin(), 0.0, spd * dir.cos())
    }
}
```

### 2. Height Gradient (Atmospheric Boundary Layer)

Wind speed increases with height above ground following a logarithmic wind profile:

```
v(h) = v_ref * ln(h / z0) / ln(h_ref / z0)

where:
  z0 = surface roughness length (~0.01m for short grass)
  h_ref = reference height (typically 10m, where base wind is measured)
  v_ref = base wind speed
```

At ground level (h ≈ 0.1m), wind is ~40% of the speed at 10m. At disc flight height (~1.5m), wind is ~80%. At huck apex (~6-8m), it's ~95-100%. This matters: a disc climbing gains wind exposure.

### 3. Turbulence (Perlin Noise Flow)

Turbulent fluctuations give the wind texture and unpredictability. Implemented as multi-octave 4D Perlin noise (3 spatial + 1 temporal):

```rust
fn turbulence(pos: Vec3, time: f32, intensity: f32) -> Vec3 {
    let scale = 0.02;  // spatial frequency
    let time_scale = 0.3;  // temporal frequency

    let mut result = Vec3::ZERO;

    // 3 octaves of noise for each component
    for octave in 0..3 {
        let freq = scale * (1 << octave) as f32;
        let t_freq = time_scale * (1 << octave) as f32;
        let amp = intensity / (1 << octave) as f32;

        // Use different noise seeds for each component to decorrelate
        result.x += amp * noise4d(pos.x * freq, pos.y * freq, pos.z * freq, time * t_freq, 0);
        result.y += amp * 0.3 * noise4d(pos.x * freq, pos.y * freq, pos.z * freq, time * t_freq, 1);
        result.z += amp * noise4d(pos.x * freq, pos.y * freq, pos.z * freq, time * t_freq, 2);
    }

    result
}
```

The vertical component is dampened (0.3x) because real wind turbulence is primarily horizontal near the surface.

Turbulence intensity scales with base wind speed:
- Calm (0-3 m/s): intensity = 0.3
- Breezy (3-7 m/s): intensity = 0.8
- Windy (7-12 m/s): intensity = 1.5
- Storm (12+ m/s): intensity = 3.0

### 4. Gust System

Discrete gust events that sweep across the field. These are the "oh shit" moments.

```rust
struct Gust {
    origin: Vec2,           // where the gust starts (off-field)
    direction: Vec2,        // movement direction
    speed: f32,             // gust speed addition (m/s)
    width: f32,             // cross-wind width (m)
    length: f32,            // along-wind length (m)
    travel_speed: f32,      // how fast the gust moves across the field (m/s)
    progress: f32,          // 0..1, current position along path
    shape: GustShape,       // Gaussian, sharp-front, etc.
}

enum GustShape {
    Gaussian,               // Smooth bell curve
    SharpFront,             // Sudden onset, gradual taper
    Oscillating,            // Multiple pulses
}

impl Gust {
    fn sample(&self, pos: Vec3) -> Vec3 {
        let center = self.origin + self.direction * self.progress * self.length;
        let offset = pos.xz() - center;
        let along = dot(offset, self.direction);
        let across = dot(offset, perpendicular(self.direction));

        let envelope = match self.shape {
            GustShape::Gaussian => {
                gaussian(along, self.length * 0.3) * gaussian(across, self.width * 0.3)
            }
            GustShape::SharpFront => {
                smoothstep_front(along, self.length) * gaussian(across, self.width * 0.3)
            }
            _ => { /* ... */ }
        };

        Vec3::new(self.direction.x, 0.0, self.direction.y) * self.speed * envelope
    }
}
```

Gust spawning:
- Frequency scales with weather intensity
- Calm: 0-1 gusts per minute
- Breezy: 1-3 gusts per minute
- Windy: 3-8 gusts per minute
- Gusty (weather type): 5-15 gusts per minute, higher intensity

Gusts are **visible** before they arrive (grass bending, dust particles) so players can anticipate them.

### 5. Thermal System

Localized vertical air movements. More prominent in hot weather or near dark surfaces.

```rust
struct Thermal {
    position: Vec2,         // center on field
    radius: f32,            // m, typically 5-15m
    strength: f32,          // m/s vertical, typically 0.5-2.0
    drift: Vec2,            // slow movement with base wind
    lifetime: f32,          // seconds until dissipation
}

impl Thermal {
    fn sample(&self, pos: Vec3) -> Vec3 {
        let dist = (pos.xz() - self.position).length();
        let factor = gaussian(dist, self.radius * 0.4);
        // Thermal creates updraft in center, downdraft at edges (toroidal flow)
        let vertical = self.strength * (1.0 - 2.0 * (dist / self.radius).powi(2));
        let radial = self.strength * 0.3 * (dist / self.radius);
        let radial_dir = normalize(pos.xz() - self.position);

        Vec3::new(radial_dir.x * radial, vertical * factor, radial_dir.y * radial)
    }
}
```

Thermals create interesting disc behavior: a disc flying through an updraft zone will suddenly gain altitude. Strategic players can exploit this for longer throws.

### 6. Obstacle Deflection

If the field has nearby objects (trees, buildings, scoreboards), wind deflects around them. Pre-computed as a static flow field overlay:

```
For each obstacle:
  - Upstream: wind slows and diverts around
  - Downstream: wind shadow (reduced speed, increased turbulence)
  - Sides: wind accelerates (venturi effect)
```

For the initial version, this is low priority. The basic field has no obstacles. But tournament venues with trees along the sidelines could add this for advanced gameplay.

## Wind Visualization

**Critical**: The wind must be visible. Players need to read the wind before throwing. Multiple visual layers communicate wind information:

### 1. Grass Rendering

The field grass bends in the wind direction. This is the primary wind indicator.

```
- Each grass blade is a quad with procedural sway
- Sway direction and magnitude = local wind vector
- Wind gusts create visible "waves" rippling across the field
- 10,000-50,000 grass instances (instanced rendering)
- Wind sampled per-instance from the wind field
```

This can be done efficiently in the vertex shader:
```glsl
// Grass vertex shader
uniform sampler2D u_windField;  // 2D texture encoding wind vectors
uniform float u_time;

void main() {
    vec2 fieldUV = (worldPos.xz - fieldMin) / fieldSize;
    vec3 wind = texture2D(u_windField, fieldUV).xyz;

    // Bend grass based on wind
    float bendFactor = length(wind) * 0.15;
    float bendDir = atan(wind.z, wind.x);

    // Apply bending to vertex position (more at tip, none at root)
    float tipFactor = uv.y;  // 0 at root, 1 at tip
    pos.x += sin(bendDir) * bendFactor * tipFactor * tipFactor;
    pos.z += cos(bendDir) * bendFactor * tipFactor * tipFactor;

    // Add micro-sway for liveliness
    pos.x += sin(u_time * 3.0 + worldPos.x * 0.5) * 0.01 * tipFactor;
}
```

### 2. Wind Particles

Small floating particles (dust, pollen, dandelion seeds) that drift with the wind:
- Rendered as small billboarded quads or points
- Follow the local wind vector
- Spawn density proportional to wind intensity
- Fade in/out at spawn/despawn
- Particularly dense during gusts

### 3. Field Flags / Streamers

Small flags at field corners and on the sideline benches:
- React to local wind in real-time
- Classic wind indicator for athletes
- Animated cloth simulation (simple spring system)

### 4. Wind HUD Indicator

A compass-style wind indicator in the HUD:
- Arrow showing wind direction (relative to camera or field)
- Speed readout in m/s or mph
- Color-coded: green (calm) → yellow (breezy) → orange (windy) → red (stormy)
- Gust warning: flashes when a gust is incoming

### 5. Throw Preview

When aiming a throw, the trajectory prediction already accounts for wind. But additionally:
- Show the wind at the disc's current position as a colored arrow
- The trajectory preview line changes color where strong wind zones affect it
- Gust zones could flash on the trajectory preview

## GPU Compute Option (WebGPU)

For higher-fidelity wind simulation, the wind field can be updated on the GPU using WebGPU compute shaders. This allows:

- Higher grid resolution (1m or 0.5m cells)
- More octaves of turbulence noise
- Per-frame advection (wind carrying itself forward)
- Simplified Navier-Stokes for obstacle interaction

### Compute Shader Architecture

```
Buffer: windField[75][40][6] = vec4 (xyz velocity + temperature)

Pass 1: Advection
  - Each cell advects its velocity by the local velocity (semi-Lagrangian)
  - Adds base wind, turbulence noise

Pass 2: Pressure (Jacobi iterations)
  - Enforce divergence-free condition (incompressible flow)
  - 10-20 Jacobi iterations

Pass 3: Apply gusts and thermals
  - Additively blend gust and thermal contributions

Pass 4: Write to texture
  - Output wind field as a 3D texture (or 2D texture atlas for WebGL fallback)
  - Grass shader and particle systems sample this texture
```

### WebGPU Availability

As of 2026, WebGPU is available in Chrome, Edge, and Firefox. Safari support is improving. For fallback:
- Use CPU wind simulation (lower resolution, simpler model)
- Or WebGL compute-via-fragment-shader (encode wind field into render target)

The WASM disc physics crate can use either GPU-sampled or CPU-sampled wind transparently.

## Fallback: CPU Wind (Minimum Viable)

For browsers without WebGPU or on low-end hardware:

```
Grid resolution: 5m cells → 30 x 16 = 480 columns, 3 height layers = 1,440 cells
Update: every 3 frames (20Hz at 60fps)
Turbulence: 2 octaves of Perlin noise
No pressure solve
No advection
Bilinear interpolation for sampling between cells
```

This is still good enough for gameplay. The wind will be less detailed but strategically equivalent.

## Wind Presets

| Preset | Base Speed | Direction | Turbulence | Gusts | Thermals |
|--------|-----------|-----------|------------|-------|----------|
| Dead Calm | 0-1 m/s | Stable | Minimal | None | None |
| Light Breeze | 2-4 m/s | Stable | Low | Rare, gentle | None |
| Moderate | 5-8 m/s | Slow drift | Medium | Occasional | Rare |
| Windy | 9-12 m/s | Variable | High | Frequent | Some |
| Gusty | 6-10 m/s | Erratic | Very High | Constant, strong | Frequent |
| Hurricane | 15+ m/s | Steady | Extreme | Massive | Many |
| Swirling | 5-8 m/s | Rotating | High | Directional chaos | Lots |

## Wind Strategy

How wind changes gameplay:

### Headwind (Throwing into the wind)
- Disc has higher effective airspeed → more lift → floats longer
- More turn (for understable throws)
- **Strategy**: Throw low-release, nose-down, with extra spin. Use overstable throws.

### Tailwind (Wind at your back)
- Disc has lower effective airspeed → less lift → drops faster
- Less turn, more fade
- **Strategy**: Throw with more loft, slightly nose-up. Disc will go far but drop quickly.

### Crosswind
- Disc drifts laterally
- IO (into-the-wind) throws fight the wind and hold the line
- OI (with-the-wind) throws get pushed further sideways
- **Strategy**: Use throw selection to work with or against the wind. Forehand into a left-to-right crosswind, backhand into a right-to-left crosswind.

### Upwind/Downwind Points
- In competitive ultimate, teams alternate pulling direction
- Playing upwind is harder -- shorter throws, more turnovers
- Playing downwind is easier -- monster hucks, aggressive offense
- Wind direction relative to the field is strategically critical

This creates real strategic depth. The wind isn't just a nuisance -- it's a dimension of the game that rewards knowledge and adaptability.

## Implementation Priority

1. **MVP**: Base wind + height gradient + 2-octave turbulence noise. CPU. ~200 lines of Rust/WASM.
2. **V1**: Add gust system + grass visualization + wind HUD. CPU. ~500 more lines.
3. **V2**: GPU wind field (WebGPU). Full turbulence. Thermals. Particle visualization. Obstacle deflection.
4. **V3**: Navier-Stokes pressure solve. Advection. Field-aware (goals, scoreboards, trees). Full weather system integration.
