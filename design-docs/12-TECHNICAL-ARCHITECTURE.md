# Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    TypeScript                         │   │
│  │                                                       │   │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐  │   │
│  │  │  Game   │ │    AI    │ │   UI     │ │  Audio  │  │   │
│  │  │  Loop   │ │  System  │ │ (DOM)    │ │ (WebAud)│  │   │
│  │  └────┬────┘ └────┬─────┘ └────┬─────┘ └────┬────┘  │   │
│  │       │           │            │             │        │   │
│  │  ┌────▼───────────▼────────────▼─────────────▼────┐  │   │
│  │  │              Three.js Renderer                  │  │   │
│  │  │          (Scene, Camera, WebGL)                 │  │   │
│  │  └────────────────────┬───────────────────────────┘  │   │
│  └───────────────────────┼──────────────────────────────┘   │
│                          │                                   │
│  ┌───────────────────────┼──────────────────────────────┐   │
│  │                  WASM Module                          │   │
│  │  ┌─────────────┐ ┌───▼─────────────┐                │   │
│  │  │ Disc Physics │ │  Wind Field     │                │   │
│  │  │ (frisque-    │ │  Simulation     │                │   │
│  │  │  physics)    │ │                 │                │   │
│  │  └─────────────┘ └─────────────────┘                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           WebGPU Compute (optional)                   │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │  High-res Wind Field + Grass Animation          │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           localStorage (Save Data)                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Runtime Dependencies

| Technology | Version | Purpose |
|-----------|---------|---------|
| Three.js | ^0.170 | 3D rendering (WebGL) |
| frisque-physics (WASM) | custom | Disc flight simulation |

That's it. Two dependencies. The entire game is built on Three.js + a custom WASM crate.

### Build Dependencies

| Tool | Version | Purpose |
|------|---------|---------|
| Vite | ^6.0 | Build, dev server, HMR |
| TypeScript | ^5.7 | Type safety |
| wasm-pack | latest | Compile Rust → WASM |
| Rust / Cargo | stable | Disc physics crate |

### Browser Requirements

| Feature | Used For | Fallback |
|---------|----------|----------|
| WebGL 2.0 | 3D rendering | None (required) |
| Web Audio API | Procedural audio | Muted (playable without) |
| WebAssembly | Disc physics, wind | JS fallback (slower) |
| WebGPU | High-res wind (optional) | CPU wind simulation |
| localStorage | Save games | In-memory (no saves) |
| ES2020 modules | Code loading | Bundled (Vite handles) |

## Module Architecture

### Source File Layout

```
src/
├── main.ts              # Entry point, game loop, scene setup
├── Game.ts              # Game state machine (menu, playing, paused, etc.)
│
├── physics/
│   ├── DiscBridge.ts    # TypeScript ↔ WASM bridge for disc physics
│   ├── WindBridge.ts    # TypeScript ↔ WASM bridge for wind field
│   ├── Collision.ts     # Player-player, player-disc collisions
│   └── FieldBounds.ts   # Out-of-bounds detection
│
├── entities/
│   ├── Player.ts        # Player entity (position, stats, state)
│   ├── Disc.ts          # Disc entity (state, trail, visual)
│   ├── Team.ts          # Team data (roster, colors, playbook)
│   └── Field.ts         # Field geometry, markings, zones
│
├── rendering/
│   ├── Stickman.ts      # Stickman skeleton + renderer
│   ├── Animation.ts     # Procedural animation system
│   ├── Grass.ts         # Instanced grass rendering + wind reaction
│   ├── DiscRenderer.ts  # Disc mesh, trail, spin visualization
│   ├── Sky.ts           # Sky dome, lighting, time-of-day
│   ├── Particles.ts     # Particle effects (catch, score, grass spray)
│   ├── Camera.ts        # Smart camera system
│   └── PostFX.ts        # Slow-mo, screen shake, vignette
│
├── gameplay/
│   ├── Match.ts         # Match state (score, time, possession, stall)
│   ├── Point.ts         # Single point flow (pull → score/turnover)
│   ├── Throw.ts         # Throw input, aiming, release
│   ├── Catch.ts         # Catching mechanics, timing windows
│   ├── Movement.ts      # Player movement, cutting, stamina
│   ├── Spirit.ts        # Spirit of the Game system
│   └── Pull.ts          # Pull/kickoff mechanics
│
├── ai/
│   ├── TeamAI.ts        # Strategic layer (formations, plays)
│   ├── PlayerAI.ts      # Individual player decisions
│   ├── Offense.ts       # Offensive AI behaviors
│   ├── Defense.ts       # Defensive AI behaviors
│   └── Marking.ts       # Mark AI (stall count, forcing)
│
├── management/
│   ├── Career.ts        # Career mode state machine
│   ├── Roster.ts        # Roster management
│   ├── Playbook.ts      # Playbook editor data
│   ├── Season.ts        # Season calendar, tournaments
│   ├── Recruiting.ts    # Tryout system, player generation
│   ├── Training.ts      # Practice and player development
│   └── Simulation.ts    # Auto-play match simulation
│
├── ui/
│   ├── HUD.ts           # In-game HUD overlay
│   ├── Menus.ts         # Title, pause, settings menus
│   ├── MatchUI.ts       # Scoreboard, stall counter, wind indicator
│   ├── ManagementUI.ts  # Career mode screens
│   ├── PlaybookUI.ts    # X's and O's editor
│   ├── TouchControls.ts # Mobile virtual joystick + buttons
│   └── Replay.ts        # Replay viewer UI
│
├── audio/
│   ├── AudioEngine.ts   # Core audio system (Web Audio API)
│   ├── DiscSounds.ts    # Throw, flight, catch, ground sounds
│   ├── PlayerSounds.ts  # Footsteps, vocals, grunts
│   ├── AmbientSounds.ts # Wind, birds, crowd
│   ├── Music.ts         # Dynamic music system
│   └── UISounds.ts      # Menu clicks, score jingles
│
├── data/
│   ├── Types.ts         # All TypeScript interfaces and types
│   ├── Constants.ts     # Game constants (field dimensions, timings)
│   ├── TeamPresets.ts   # Preset teams (names, colors, ratings)
│   ├── Names.ts         # Player name generation lists
│   └── SaveLoad.ts      # localStorage save/load
│
└── utils/
    ├── Math.ts          # Vector math, interpolation, noise
    ├── Random.ts        # Seeded RNG
    └── Debug.ts         # Nerd mode overlays, FPS counter
```

### Estimated Size

| Category | Files | Est. Lines |
|----------|-------|------------|
| Physics bridges | 4 | 600 |
| Entities | 4 | 1,200 |
| Rendering | 8 | 4,000 |
| Gameplay | 7 | 3,500 |
| AI | 5 | 3,000 |
| Management | 7 | 4,000 |
| UI | 7 | 3,500 |
| Audio | 6 | 2,500 |
| Data/Utils | 6 | 1,500 |
| **Total TS** | **54** | **~24,000** |

Plus the Rust WASM crate:

| Crate | Est. Lines |
|-------|------------|
| frisque-physics (disc sim) | ~1,500 |
| frisque-wind (wind field) | ~1,000 |
| **Total Rust** | **~2,500** |

## Rust WASM Crate: `frisque-physics`

### Crate Structure

```
frisque-physics/
├── Cargo.toml
├── src/
│   ├── lib.rs           # WASM entry point, wasm-bindgen exports
│   ├── disc.rs          # DiscState, DiscProfile, DiscSim
│   ├── aero.rs          # Aerodynamic coefficient tables and computation
│   ├── integration.rs   # RK4 integration
│   ├── wind.rs          # WindField, WindSample, wind layers
│   ├── noise.rs         # Perlin noise implementation
│   ├── math.rs          # Vec3, Quaternion, matrix operations
│   └── ground.rs        # Ground interaction (bounce, skip, stop)
```

### WASM Interface

```rust
#[wasm_bindgen]
pub struct DiscSimulator {
    disc: DiscSim,
    wind: WindField,
}

#[wasm_bindgen]
impl DiscSimulator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> DiscSimulator;

    pub fn throw(&mut self,
        speed: f32, dir_x: f32, dir_y: f32, dir_z: f32,
        spin: f32, nose_angle: f32, hyzer: f32,
        release_height: f32, off_axis: f32,
        is_forehand: bool
    );

    pub fn step(&mut self, dt: f32) -> bool;  // returns false when grounded

    // Getters (return individual components to avoid complex types)
    pub fn pos_x(&self) -> f32;
    pub fn pos_y(&self) -> f32;
    pub fn pos_z(&self) -> f32;
    pub fn vel_x(&self) -> f32;
    pub fn vel_y(&self) -> f32;
    pub fn vel_z(&self) -> f32;
    pub fn spin_rate(&self) -> f32;
    pub fn angle_of_attack(&self) -> f32;

    // Orientation as euler angles for Three.js
    pub fn rot_x(&self) -> f32;
    pub fn rot_y(&self) -> f32;
    pub fn rot_z(&self) -> f32;

    // Wind field
    pub fn set_base_wind(&mut self, speed: f32, direction: f32);
    pub fn update_wind(&mut self, dt: f32);
    pub fn wind_at(&self, x: f32, y: f32, z: f32) -> Vec<f32>;  // [wx, wy, wz]
    pub fn add_gust(&mut self, origin_x: f32, origin_z: f32, dir_x: f32, dir_z: f32, speed: f32, width: f32);

    // Trajectory prediction (returns flat array of positions)
    pub fn predict(&self, duration: f32, steps: u32) -> Vec<f32>;  // [x0,y0,z0, x1,y1,z1, ...]
}
```

### JS Fallback

If WASM is unavailable, a TypeScript implementation of the same interface provides basic disc physics:
- Simpler model (no aerodynamic tables, analytical coefficients only)
- Lower integration rate (120Hz vs 240Hz)
- Simpler wind (base + noise, no gusts/thermals)
- Functional but not as physically nuanced

## Game Loop

```typescript
// main.ts
const PHYSICS_DT = 1 / 240;  // 240Hz physics
let physicsAccumulator = 0;

function gameLoop(timestamp: number) {
    const frameDt = Math.min((timestamp - lastTimestamp) / 1000, 0.05); // Cap at 50ms
    lastTimestamp = timestamp;

    // Input
    inputSystem.poll();

    // Physics (fixed timestep)
    physicsAccumulator += frameDt;
    while (physicsAccumulator >= PHYSICS_DT) {
        if (gameState === GameState.Playing) {
            // Disc physics (WASM)
            if (disc.inFlight) {
                discSim.step(PHYSICS_DT);
                disc.syncFromWasm(discSim);
            }

            // Wind field update (WASM)
            discSim.update_wind(PHYSICS_DT);

            // Player physics (JS - simpler physics, no need for WASM)
            for (const player of allPlayers) {
                player.physicsStep(PHYSICS_DT);
            }

            // Collisions
            collisionSystem.resolve(allPlayers, disc);
        }
        physicsAccumulator -= PHYSICS_DT;
    }

    // Game logic (every frame)
    if (gameState === GameState.Playing) {
        match.update(frameDt);
        aiSystem.update(frameDt);
        spiritSystem.update(frameDt);
    }

    // Animation (every frame, interpolated)
    const alpha = physicsAccumulator / PHYSICS_DT;
    for (const player of allPlayers) {
        player.animate(frameDt);
        player.interpolateRender(alpha);
    }
    disc.animate(frameDt, alpha);

    // Rendering
    camera.update(frameDt);
    grass.updateWind(discSim);  // Upload wind texture
    particles.update(frameDt);
    renderer.render(scene, camera);

    // Audio
    audioEngine.update(frameDt);

    // UI
    hud.update(match, disc, controlledPlayer);

    requestAnimationFrame(gameLoop);
}
```

## State Management

### Game State Machine

```
                    ┌──────────┐
         ┌─────────│  TITLE   │──────────┐
         │         └────┬─────┘          │
         │              │                │
    ┌────▼────┐   ┌────▼─────┐    ┌────▼──────┐
    │PRACTICE │   │QUICK MATCH│    │  CAREER   │
    │  MODE   │   │  SETUP   │    │   HUB     │
    └────┬────┘   └────┬─────┘    └────┬──────┘
         │              │                │
         │         ┌────▼─────┐    ┌────▼──────┐
         │         │ PLAYING  │◄───│MATCH SETUP│
         └────────►│          │    └───────────┘
                   └────┬─────┘
                   ┌────▼─────┐
                   │  PAUSED  │
                   └────┬─────┘
                   ┌────▼─────┐
                   │POST-GAME │
                   └──────────┘
```

### Data Flow

```
Input → Game Logic → Physics (WASM) → Rendering (Three.js)
                  ↕                  ↕
              AI System          Animation
                  ↕                  ↕
            Match State           Audio
                  ↕
            Save/Load (localStorage)
```

## Performance Targets

| Metric | Target | Budget |
|--------|--------|--------|
| FPS | 60 | 16.6ms per frame |
| Physics | 240Hz | ~0.5ms per tick (WASM) |
| AI (14 players) | 10Hz decisions | ~2ms per update |
| Rendering | 60Hz | ~8ms per frame |
| Audio | Continuous | ~1ms per frame |
| Animation | 60Hz | ~1ms per frame |
| UI DOM updates | 30Hz | ~0.5ms per update |
| **Headroom** | | ~3.6ms |

### Performance Tiers

**High (Desktop, dGPU):**
- 50,000 grass instances
- Full particle effects
- WebGPU wind field (if available)
- High-res shadows
- Maximum draw distance

**Medium (Laptop, iGPU):**
- 20,000 grass instances
- Reduced particles
- CPU wind field
- Medium shadows
- Standard draw distance

**Low (Mobile, old hardware):**
- 5,000 grass instances
- Minimal particles
- Simplified wind
- No shadows
- Reduced draw distance
- Lower render resolution (0.75x)

Auto-detection based on initial frame time measurements. Manual override in settings.

## Build Pipeline

```
Source files:
  TypeScript (src/**/*.ts) → tsc type-check → Vite bundle → dist/assets/main.js
  Rust (frisque-physics/) → wasm-pack build → pkg/frisque_physics_bg.wasm
  HTML (index.html) → Vite process → dist/index.html

Build command:
  cd frisque-physics && wasm-pack build --target web
  cd .. && npm run build

Output:
  dist/
  ├── index.html          (~50KB - CSS embedded)
  ├── assets/
  │   ├── main-[hash].js  (~200KB gzipped estimate)
  │   └── frisque_physics_bg.wasm  (~50KB estimate)
  └── (no other assets - everything is procedural)

Total download: ~300KB gzipped (fast cold load)
```

## Deployment

Same as Booty Hunt: GitHub Pages via GitHub Actions.

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [dev]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Build WASM
      - uses: actions-rs/toolchain@v1
        with: { toolchain: stable, target: wasm32-unknown-unknown }
      - run: cargo install wasm-pack
      - run: cd frisque-physics && wasm-pack build --target web

      # Build JS
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build

      # Deploy
      - uses: peaceiris/actions-gh-pages@v3
        with: { github_token: ${{ secrets.GITHUB_TOKEN }}, publish_dir: ./dist }
```

## Testing Strategy

### Unit Tests (Rust)
```
frisque-physics crate has standard Rust tests:
  - Disc free flight matches expected trajectory
  - Wind sampling interpolation correctness
  - Coefficient lookup table accuracy
  - Integration stability (no NaN, no explosion)
  - Ground collision detection
  - Edge cases (zero spin, zero speed, vertical throw)

Run: cargo test
```

### Integration Tests (TypeScript)
```
Vitest for TypeScript:
  - WASM bridge correctly transfers data
  - Game state transitions are correct
  - AI decision-making produces valid actions
  - Save/load roundtrip preserves data
  - Score tracking is correct

Run: npm test
```

### Visual Tests (Manual)
```
Checklist for each release:
  - Disc flight looks correct for all throw types
  - Grass responds to wind
  - Stickman animations are smooth
  - Camera tracking is comfortable
  - Audio plays correctly
  - Mobile controls work
  - No visual glitches
```

### Performance Tests
```
  - 60fps sustained during active play (14 players + disc + effects)
  - WASM physics overhead < 1ms per frame
  - No memory leaks during extended play sessions
  - localStorage save/load < 100ms
```

## Migration from Booty Hunt

The Booty Hunt codebase provides a starting foundation. Here's what we keep, modify, and replace:

### Keep (Mostly Unchanged)
- Vite build configuration
- Three.js renderer setup (tone mapping, fog tweaks)
- Sky system (adapt colors, remove pirate sun)
- Particle effects framework (repurpose for disc trails, catches)
- Audio engine architecture (new sounds, same synthesis approach)
- UI DOM approach (new elements, same pattern)
- Mobile detection and performance scaling
- GitHub Actions deployment

### Modify Significantly
- Main game loop (new game state machine)
- Camera system (new tracking modes for field sport)
- Weather system (adapt for field conditions)
- Input handling (new control scheme)

### Replace Entirely
- Ocean → Grass field
- Ship → Stickman players
- Combat → Throwing/catching
- Cannonballs → Disc
- Ports → Management mode
- Progression/waves → Season/career
- Enemy AI → Teammate/opponent AI
- Crew → Roster management
- Events → Match events (fouls, timeouts)
- World/Islands → Field venues

### New Systems
- Disc physics (WASM)
- Wind field simulation
- Stickman skeleton + procedural animation
- Ultimate frisbee game rules engine
- Strategic/tactical AI
- Management mode
- Playbook editor
- Replay system
