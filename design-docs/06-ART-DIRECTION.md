# Art Direction

## Visual Identity

FrisQueendom's art style is **stickman maximalism**: minimal character construction, maximal expression and polish in everything else. The stickmen are simple. The world around them is rich.

Think: a beautifully rendered field, dramatic lighting, lush particle effects... populated by expressive stick figures who play with absolute conviction.

The contrast IS the style.

## Color Palette

### Field
- **Grass**: Rich greens with depth variation. Lighter where sun hits, darker in shadows. Slightly yellow near sidelines (worn turf).
- **Lines**: Bright white, slightly raised, with subtle glow in evening/night games.
- **Cones**: Traffic-orange at corners, visible from any camera angle.
- **Sky**: Full dynamic sky system (inherited from Booty Hunt). Sunrise golds, midday blues, sunset pinks, night deep blues with stadium light glow.

### Players (Stickmen)
- **Body**: Bold black strokes (3-4px at default zoom). Clean, high-contrast against any background.
- **Team colors**: Jersey area filled with team primary color. Shorts with team secondary.
  - Home: darker colors
  - Away: lighter colors
  - 16 preset team color schemes with names
- **Disc in hand**: Disc color visible in hand. White is default but team discs are unlockable.
- **Eyes**: Two dots. Expressive through position (looking at disc, looking downfield, looking surprised).
- **Mouth**: Simple line. Curves up (happy), down (frustrated), open circle (shocked/celebrating).

### UI
- **Primary accent**: Electric blue (#00A8FF) -- the disc trail color
- **Secondary accent**: Warm gold (#FFD700) -- inherited, repurposed for score/achievements
- **Background**: Dark translucent panels with subtle blur
- **Text**: Clean sans-serif (contrast to the playful stickmen). Inter or similar.
- **Warning/urgent**: Pulsing red-orange

### Disc
- **Default**: White with subtle bevel shading
- **In flight**: Rotation visible via a colored band or logo mark on top
- **Trail**: Translucent blue streak that fades over ~0.5s. Thicker for faster throws.
- **Spin visualization**: At close camera, the disc's rotation is visible. At distance, a subtle blur effect conveys spin rate.

## Stickman Character Design

### Anatomy

```
       O          ← Head: circle, 8px radius
       |          ← Neck: 2px line
      /|\         ← Torso: angled lines from shoulders to waist
     / | \            with jersey color fill between them
       |          ← Waist
      / \         ← Legs: 2 lines from waist to feet
     /   \            with shorts color fill
```

### Construction Rules

1. **Head**: Perfect circle. Contains two dot eyes and optional mouth line.
2. **Torso**: Triangle formed by shoulder points and waist point. Filled with jersey color.
3. **Arms**: Two-segment (upper arm + forearm). Each segment is a line with round joint.
4. **Legs**: Two-segment (thigh + shin). Each segment is a line with round joint.
5. **Hands**: Small circles at wrist joints. Visible when catching/throwing.
6. **Feet**: Small angled lines at ankle joints. Direction indicates facing.
7. **All lines**: Consistent stroke width (3px at default zoom), black, round endcaps.

### Scale

- Standing height: ~2m in world space
- Head diameter: ~0.4m (slightly exaggerated for readability)
- Shoulder width: ~0.6m
- At default camera distance, a player is ~80-120px tall on screen

### Jerseys & Numbers

- Jersey is the filled triangle torso area
- Number rendered on the back (visible from broadcast camera angle)
- Captain: armband (small colored band on upper arm)
- Headband: optional horizontal line across forehead (customizable)
- Sweatband: optional band on wrist

### Player Differentiation

Since stickmen are inherently similar, differentiation comes from:
- **Height**: Short (1.7m) to tall (2.0m), affects jump and reach
- **Build**: Thin lines vs slightly thicker lines (visual only, no gameplay)
- **Accessories**: Headbands, wristbands, knee pads (cosmetic)
- **Hair**: Simple line extensions from head top. Ponytail, mohawk, afro (circle), etc.
- **Animation style**: Each player's idle and movement animations have subtle personality quirks

## The Field

### Grass

The grass is a major visual element and the primary wind indicator.

```
Grass rendering (instanced):
- Individual blades: thin triangles, 3-8cm tall
- Density: 10,000-50,000 instances (performance-scaled)
- Base color: green with variation (Perlin noise for patches)
- Tip color: lighter green (subsurface scattering approximation)
- Wind animation: vertex shader displacement based on wind field texture
- Mowing pattern: subtle striped pattern (darker/lighter alternating lanes)
  oriented perpendicular to the endzones (like a real turf field)
```

### Field Markings

- White lines painted on the grass (slightly raised geometry or decal)
- Endzone lines, sidelines, brick marks
- Optional: yard markers every 10m (training mode)
- Cones at corners: small 3D cone meshes with orange material

### Surroundings

The field exists in a larger environment:

**Park setting** (default):
- Trees along the edges (simplified, stylized)
- Park benches for spectators
- Trash cans, picnic tables in the background
- Joggers passing by (ambient stickmen)
- Dogs (stick dogs??) watching from the sideline

**Tournament setting** (unlockable):
- Temporary fencing around the field
- Scorer's table
- Spectator areas with animated crowd (stick crowd)
- Announcer booth
- Banners and flags (react to wind)

**Stadium setting** (late-game unlock):
- Full stadium with lights
- Massive crowd sections
- Jumbotron showing replays
- Professional sideline setup
- Night lighting with dramatic shadows

## Lighting

### Time of Day

Each match has a time-of-day setting affecting the entire visual mood:

**Morning (6-9am)**
- Low sun angle, long shadows
- Golden warm light
- Dew on grass (subtle sparkle)
- Mist (low fog near ground)

**Midday (11am-1pm)**
- Overhead sun, short shadows
- Harsh bright light, high contrast
- Clear visibility
- Heat shimmer (optional distortion effect)

**Golden Hour (4-6pm)**
- Rich warm light
- Extremely long shadows
- Everything looks cinematic
- Best setting for dramatic screenshots

**Sunset (6-7pm)**
- Sun on horizon, blinding if you face it
- Silhouette shots when players are backlit
- Sky gradient from orange to purple
- Atmospheric

**Night (stadium lights)**
- Bright focused lighting from above
- Visible light beams (volumetric)
- Deep shadows between light pools
- Moths flying around lights
- Dramatic atmosphere

### Shadow System

- Real-time shadows from sun/lights
- Player shadows visible on grass (important for spatial awareness)
- Disc shadow on grass (critical for disc height estimation)
- Shadow softness varies with sun angle (hard at noon, soft at golden hour)

## Particle Effects

FrisQueendom should feel *alive* with particles:

### Disc Trail
- Translucent blue/white streak behind the disc
- Width proportional to disc speed
- Opacity proportional to speed
- Fades over 0.3-0.5 seconds
- Color shifts to team color for scored throws

### Grass Spray
- When players cut hard, grass particles fly up from their feet
- Green and brown particles
- Amount proportional to cut sharpness
- Leave subtle skid marks on the turf

### Catch Burst
- Small burst of particles on successful catch
- Color: team color
- Size: proportional to throw difficulty caught
- Layout catch: massive spray of grass + catch particles

### Score Explosion
- When a point is scored: big particle explosion from the endzone
- Team color fireworks
- Confetti-like particles
- Smoke rings
- Screen shake (subtle)

### Wind Particles
- Dust, pollen, leaves drifting with wind
- Density increases with wind speed
- Direction shows wind movement to player
- Gusts create visible "walls" of particles approaching

### Sweat Drops
- On hot weather / high-endurance plays
- Small transparent particles flying off sprinting players
- Subtle, not gross

### Rain
- Individual raindrop particles
- Splash effects on the grass
- Ripples in any puddles
- Players look slightly hunched when running in rain

## Camera Effects

### Slow Motion
Triggered on spectacular plays:
- Layout catches
- Sky attempts
- Scoring plays (option to disable)
- Block/interception attempts

Slow-mo is 25% speed for 0.5-1.0s (game time), then smoothly returns to normal. Camera may rotate slightly for a cinematic angle during slow-mo.

### Screen Shake
Triggered on:
- Layout landing (player hitting ground)
- Score celebrations
- Big blocks

Shake should be subtle -- enough to feel impactful, not enough to be annoying.

### Focus Effects
- Slight depth-of-field during throw aiming (background blurs)
- Vignette during high-pressure moments (high stall count, game point)
- Chromatic aberration on big plays (extremely subtle, optional)

## Procedural Everything

Following the Booty Hunt philosophy, all assets are procedurally generated:

- No texture files. Grass, field, sky are shader-generated.
- No model files. Stickmen are constructed from primitives (lines, circles, triangles).
- No audio files (see Audio doc).
- Disc is a flat cylinder primitive.
- Trees/buildings are simplified geometric constructions.
- This keeps the entire game as a single .js bundle with zero asset loading.
