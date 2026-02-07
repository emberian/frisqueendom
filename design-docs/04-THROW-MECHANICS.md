# Throw Mechanics

The throw system is the primary player interaction in FrisQueendom. It must feel intuitive for beginners while rewarding mastery. Every throw is a dialogue between the player's input, the thrower's stats, and the physics engine.

## Throw Types

### Primary Throws

These are the bread-and-butter throws that every player uses:

#### 1. Backhand
The classic frisbee throw. Disc spins clockwise (viewed from above) for a right-handed thrower.

| Property | Value |
|----------|-------|
| Input | Left Mouse (default grip) |
| Speed range | 8-28 m/s |
| Spin range | 40-100 rad/s |
| Default release | Slight hyzer |
| Natural flight | Straight → fade left (RHBH) |
| Wind-up time | 0.3-0.8s |
| Animation | Cross-body pull, step forward, arm extension |

Best for: Hucks (long throws), resets, swing passes. The most versatile throw.

#### 2. Forehand (Flick)
Thrown with a wrist snap, two fingers under the rim. Disc spins counter-clockwise (viewed from above) for a right-handed thrower.

| Property | Value |
|----------|-------|
| Input | Right Mouse + Left Mouse |
| Speed range | 10-30 m/s |
| Spin range | 50-120 rad/s |
| Default release | Slight anhyzer |
| Natural flight | Straight → fade right (RHFH) |
| Wind-up time | 0.2-0.5s |
| Animation | Side-arm flick, wrist snap |

Best for: Quick releases, break-mark throws, forehands into crosswind. Higher spin potential but harder to control.

#### 3. Hammer
An overhead throw where the disc is released upside-down and arcs over defenders before flipping right-side up as it descends.

| Property | Value |
|----------|-------|
| Input | Shift + Left Mouse |
| Speed range | 12-22 m/s |
| Spin range | 40-80 rad/s |
| Default release | ~60° from vertical, upside-down |
| Natural flight | Arcs up and over, curves left (RH), descends steeply |
| Wind-up time | 0.4-0.7s |
| Animation | Arm overhead, disc cocked behind head, forward snap |

Best for: Throwing over defenders, short-range lob plays, scoring in traffic. Dramatic and crowd-pleasing.

#### 4. Scoober
An upside-down forehand thrown with an upward trajectory. Like a hammer but with forehand grip and lower release.

| Property | Value |
|----------|-------|
| Input | Shift + Right Mouse + Left Mouse |
| Speed range | 8-18 m/s |
| Spin range | 30-70 rad/s |
| Default release | ~45° from vertical, upside-down |
| Natural flight | Floaty arc, curves right (RH), gentle descent |
| Wind-up time | 0.3-0.5s |
| Animation | Forehand grip, upward wrist flip |

Best for: Short-range touch passes over a mark, endzone plays. Requires finesse.

### Advanced Throws

Unlocked through play or training in Management Mode:

#### 5. Thumber
Overhead throw with thumb on inside of rim. Opposite spin to hammer.

| Property | Value |
|----------|-------|
| Input | Shift + Scroll Click + Left Mouse |
| Natural flight | Arcs up, curves right (RH), sharp descent |
| Difficulty | High |

#### 6. Blade
Disc thrown nearly vertical, slicing through the air with minimal wind resistance.

| Property | Value |
|----------|-------|
| Input | Backhand/Forehand + extreme release angle (scroll to max) |
| Natural flight | Travels fast, drops quickly, very wind-resistant |
| Difficulty | Medium-High |

#### 7. Push Pass
A short-range backhand variant with minimal wind-up. Less spin, more touch.

| Property | Value |
|----------|-------|
| Input | Quick tap Left Mouse (no charge) at close range |
| Speed range | 5-12 m/s |
| Spin range | 20-40 rad/s |
| Best for | Dump passes, dish passes in traffic |

#### 8. Skip Shot
Intentionally thrown at the ground to bounce up to a receiver. The disc skips off grass at a predictable angle.

| Property | Value |
|----------|-------|
| Input | Aim at ground + moderate power |
| Natural flight | Bounces once off turf, pops up to receiver |
| Difficulty | High |
| Best for | Getting under a poaching defender, creative endzone plays |

## Input System

### Throw Initiation

1. **Press and hold** Left Mouse to begin the throw sequence
2. A **power meter** begins charging (visible as a circular gauge around the player)
3. The **aim vector** is determined by mouse position relative to player
4. A **trajectory preview** arc appears showing predicted disc flight

### Aiming

The aim direction is determined by the mouse cursor position relative to the throwing player:

```
aim_angle = atan2(mouse.x - player_screen.x, mouse.z - player_screen.z)
```

The aim is projected onto the field plane at the throw's expected height. A small reticle shows the predicted landing point.

### Power

Power is determined by hold duration:

```
Power curve:
  0.0s → 0% power (minimum throw)
  0.3s → 30% power
  0.5s → 60% power
  0.8s → 90% power
  1.0s → 100% power (maximum throw)
  1.2s → 95% power (slight overcharge penalty)
  1.5s+ → 85% power (tired arm, diminishing returns)
```

The overcharge mechanic prevents "just hold forever" and adds a timing skill element. The power meter visually reflects this curve with a sweet spot zone.

### Release Angle (Hyzer/Anhyzer)

Controlled by scroll wheel:

```
Scroll Up   → More anhyzer (disc tilted to the right for RHBH)
Scroll Down → More hyzer (disc tilted to the left for RHBH)
Center       → Flat release
```

Range: -45° (full anhyzer) to +45° (full hyzer)

The release angle dramatically affects the disc's flight path:
- **Hyzer**: Disc starts curving in the fade direction immediately. Safe, predictable.
- **Flat**: Disc flies straight initially, then fades. Standard throw.
- **Anhyzer**: Disc curves opposite to fade initially, then fights back. Creates S-curves.

### Height

Release height is influenced by:
- Mouse vertical position (high aim = high release, low aim = low release)
- Default: waist height (~1m)
- High release: shoulder/overhead (~1.7m) -- useful for throwing over the mark
- Low release: knee height (~0.5m) -- useful for throwing under the mark's arms

### Nose Angle

The disc's pitch angle at release. Subtle but important:

- **Nose up**: Disc climbs more, catches wind, stalls sooner. Common beginner mistake.
- **Nose down**: Disc stays low, knifes through wind. Expert technique.
- Default: slight nose-up (realistic for most throws)
- Modified by: holding Ctrl slightly adjusts nose down (for experienced players)

### Off-Axis Torque (OAT) / Wobble

A clean release has the disc spinning purely around its central axis. OAT causes wobble, which:
- Reduces distance and accuracy
- Looks ugly
- Is more common on forced throws and high-power throws

OAT is determined by:
- Thrower's skill stat
- Power level (higher power = higher OAT risk)
- Pressure from the mark (closer/more active mark = more OAT)
- Throw difficulty (hammers inherently have more OAT than backhands)

## Throw Execution Pipeline

When the player releases the mouse button:

```
1. Gather inputs:
   - aim_direction (from mouse position)
   - power (from hold duration → speed mapping)
   - grip (backhand/forehand/overhead)
   - hyzer_angle (from scroll wheel state)
   - height (from mouse vertical)
   - nose_angle (from Ctrl modifier)

2. Apply player stats:
   - accuracy: perturb aim direction by random amount scaled by (1 - accuracy)
   - power_stat: scale max speed by power_stat
   - spin: compute spin rate from grip, power, and spin_stat
   - oat: compute wobble from difficulty, power, mark_pressure, oat_stat

3. Apply mark interference:
   - If mark is actively marking and the throw passes near mark's hands:
     - chance of handblock (based on mark_skill vs thrower_speed)
     - if not blocked: additional perturbation to release

4. Compute release parameters:
   ThrowRelease {
     speed: power * max_speed * power_stat_modifier,
     direction: aim_direction (perturbed by accuracy),
     spin_rate: base_spin * power * spin_modifier,
     spin_axis: disc_up (perturbed by oat),
     nose_angle: nose_input + grip_default_nose,
     hyzer_angle: scroll_input + grip_default_hyzer,
     release_height: height_input,
     off_axis: oat_amount,
   }

5. Initialize disc physics state with release parameters

6. Play throw animation
   - Animation is matched to grip type and power level
   - Camera cuts to disc-tracking mode
```

## Throw Feel

### Animation Timing

The throw should feel **responsive** but not instant:

- **Windup** (hold duration): 0.2-1.0s. Player's body coils. Visible to defenders.
- **Release** (mouse up): 0.05s. Snappy. The disc leaves the hand immediately.
- **Follow-through**: 0.3s. Player's arm extends. Camera may follow disc.

The windup is interruptible -- you can cancel a throw by pressing right mouse (or Escape). This is important for pump fakes (see below).

### Pump Fake

Press F during throw windup (or release right mouse for forehand):
- Player executes the throw motion but doesn't release the disc
- Defenders react to the fake (AI system)
- A good pump fake can open up a lane
- Animation: full windup motion that stops at the release point

### Throw Feedback

On release, communicate throw quality:
- **Clean release**: Satisfying "whoosh" sound, slight slow-mo (50ms), disc trail is crisp
- **Wobbly release**: Buzzing sound, disc visually wobbles, trail is jagged
- **Perfect release**: Screen flashes subtle gold, extra "crack" sound, disc has extra spin visual

### Trajectory Preview

The preview arc is one of FrisQueendom's signature features:

```
- Computed using the full disc physics engine (same simulation as actual flight)
- Updates every frame during aim
- Shows ~2-3 seconds of predicted flight
- Rendered as a dotted line with gradient:
  - Green: early flight (high confidence)
  - Yellow: mid flight (wind may change)
  - Red/faded: late flight (wind uncertainty)
- Disc silhouette at end of preview shows predicted landing orientation
- Wind arrows along the preview show where wind affects the path
```

The preview is NOT cheating -- real ultimate players visualize their throws before releasing. The preview just makes this intuition visible. On higher difficulties, the preview becomes shorter and less precise (more transparency in the uncertain zone).

## Throw Strategy Guide (In-Game Tips)

These should be discoverable through gameplay and tutorials:

### Into a Headwind
- Throw low-release, nose-down
- Use overstable throws (backhands for going left, forehands for going right)
- The disc will float and turn -- compensate by throwing harder with more hyzer
- IO forehands are powerful headwind throws

### Into a Tailwind
- Throw with loft -- the disc won't float as much
- Understable throws work well (disc will hold the anhyzer line)
- Be careful of nose-up throws; they'll catch the tailwind and fly over everyone
- Hucks are easier downwind

### In a Crosswind (Left to Right)
- Forehands (for right-handed) fight the wind naturally
- Backhands will get pushed right -- aim left of target
- IO backhands cut through the wind
- OI forehands ride the wind for big distances

### Breaking the Mark
The defender (mark) forces you to throw to one side. Breaking the mark means throwing to the other side:
- **Around breaks**: Curve the throw around the mark (IO throws, big anhyzer)
- **Inside breaks**: Throw through a gap between the mark's arms
- **Over breaks**: Hammer or scoober over the mark's head
- **Under breaks**: Low-release throw under the mark's arms

## Receiving Throws

When a disc is in the air and your controlled player can potentially catch it:

### Auto-Switch
The game auto-switches control to the receiver most likely to catch the disc (can be turned off in settings). The player you switch to will have a brief input buffer so the switch feels seamless.

### Catching

| Input | Catch Type | Difficulty | Style |
|-------|-----------|------------|-------|
| None (auto) | Two-hand pancake catch | Easiest | Safe, reliable |
| Left Mouse | Clap catch (hands together) | Easy | Classic |
| Right Mouse | One-hand grab | Medium | Stylish |
| Space | Layout (diving catch) | Hard | Maximum swag |
| Space + direction | Directed layout | Hardest | Highlight reel |

### Catch Window

A small timing window determines catch success:

```
- Too early: hands close before disc arrives → whiff
- Early: disc arrives as hands are closing → bobble (chance to recover)
- Perfect: hands close on disc exactly → clean catch + style bonus
- Late: disc passes through open hands → tip/bobble
- Too late: disc is already past → miss
```

The window size depends on:
- Disc speed (faster = tighter window)
- Disc angle (edge-on = tighter window)
- Player catching stat
- Weather (rain = tighter window)
- Layout vs standing (layout = wider window but higher commitment)

### Contested Catches

When attacker and defender are both going for the disc:

```
Both press jump/layout → dice roll modified by:
  - Height advantage (taller player or better jump timing)
  - Position advantage (who has inside position)
  - Catching stat vs defensive stat
  - Aggression of the attempt

Outcomes:
  - Clean catch (offensive player wins)
  - Interception / D (defensive player wins)
  - Both miss (disc falls → turnover unless tipped to another player)
  - Foul (contact before disc arrival → foul call, Spirit system)
```

### The Sky

A "sky" is when a player jumps over a defender to catch a high disc. In FrisQueendom:
- Press Space with good timing near a high disc
- Jump height influenced by player jump stat + timing
- Spectacular animation: stickman leaps above defender, grabs disc at apex
- Slow-motion trigger for dramatic effect
- If successful: massive style points + swagger celebration
