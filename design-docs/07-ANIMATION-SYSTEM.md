# Animation System

## Philosophy

Stickmen don't have faces (well, barely). They communicate entirely through body language. Every animation must be readable, exaggerated, and full of personality. The animation system is the character system.

"Swagger" is not a feature -- it's a design principle. Every movement should have a bit of *sauce*.

## Animation Architecture

### Skeleton

Each stickman has a 13-joint skeleton:

```
Joints:
  0: Head (position + rotation)
  1: Neck
  2: Left Shoulder
  3: Left Elbow
  4: Left Wrist
  5: Right Shoulder
  6: Right Elbow
  7: Right Wrist
  8: Waist/Hip
  9: Left Knee
  10: Left Ankle
  11: Right Knee
  12: Right Ankle

Bones (line segments):
  Head-Neck, Neck-LShoulder, Neck-RShoulder
  LShoulder-LElbow, LElbow-LWrist
  RShoulder-RElbow, RElbow-RWrist
  Neck-Waist
  Waist-LKnee, LKnee-LAnkle
  Waist-RKnee, RKnee-RAnkle
```

### Procedural Animation

Animations are NOT keyframed assets. They are procedurally generated from parameterized functions. This allows infinite variation and blending.

```typescript
interface AnimationPose {
  joints: Vec3[13];        // Joint positions relative to root (waist)
  root_position: Vec3;     // World position
  root_rotation: f32;      // Facing direction
}

interface AnimationParams {
  speed: f32;              // Movement speed
  direction: Vec3;         // Movement direction
  action: ActionType;      // Current action
  phase: f32;              // 0-1 cycle position
  intensity: f32;          // How "hard" they're doing it
  personality: Personality; // Affects animation flavor
}
```

### Inverse Kinematics (IK)

For catching and throwing, we use 2-bone IK to place hands precisely:

```
Throwing: IK targets the throwing hand to the release point
Catching: IK targets both hands to the disc position
Marking: IK targets hands to block throwing lanes
Pointing: IK targets one hand to the call direction
```

### Animation Blending

Animations blend smoothly between states. The blend system:

```
Current Pose = lerp(Previous Pose, Target Pose, blend_factor)
blend_factor ramps from 0→1 over blend_duration (typically 0.1-0.3s)

Additive layers:
  Base: locomotion (run, jog, idle)
  + Upper body: action (throw, catch, mark)
  + Head: look-at (track disc, scan field)
  + Expression: face (eyes, mouth)
```

## Locomotion Animations

### Idle

```
Base idle:
- Weight on one leg, slight lean
- Arms loose at sides, slight sway
- Head occasionally turns to look around
- Breathing: subtle torso rise and fall (1-2px amplitude, 3s cycle)

Personality variations:
- Bouncy: slight toe bouncing, weight shifting side to side
- Cool: very still, arms crossed or hands on hips
- Nervous: shifting weight, touching face, looking around rapidly
- Ready: athletic stance, knees bent, leaning forward slightly
```

### Jogging

```
- Standard run cycle, moderate arm swing
- 0.5s cycle period (2 steps per second)
- Hips rotate slightly with each step
- Head stays relatively stable (natural stabilization)
- Feet arc naturally (toe-off → knee lift → foot plant)

Procedural parameters:
  stride_length = base * speed / max_speed
  arm_swing = base * speed / max_speed
  lean_forward = 5° + 10° * (speed / max_speed)
  hip_rotation = 10° * sin(phase)
```

### Sprinting

```
- Exaggerated version of jog
- Longer stride, higher knee lift
- More forward lean (15-20°)
- Arms pumping higher and more aggressively
- Head jutting forward slightly
- 0.35s cycle period (faster turnover)

Additional effects:
- Speed lines behind player (subtle)
- Grass spray from feet
- Jersey fluttering
```

### Cutting

The cut animation sells the move:

```
Setup phase (0.1s before cut):
- Plant outside foot hard
- Body lowers center of gravity (crouch)
- Arms start to shift balance

Cut phase (0.15s):
- Sharp direction change
- Body leans into new direction aggressively (30-45° lean)
- Push-off foot extends behind
- First step in new direction is explosive

Recovery phase (0.2s):
- Body straightens
- Transitions back into sprint cycle
- Arms rebalance

Visual effect: sharp angle change in the player's path, with a brief "crouch-explode" motion
```

### Jumping

```
Prep (0.1s):
- Bend knees, arms go back
- Center of gravity drops

Launch (0.05s):
- Legs extend explosively
- Arms swing up
- Body extends vertical

Air (0.3-0.6s):
- Full body extension
- Arms reaching for disc (if catching)
- Legs tucked or extended depending on context

Landing (0.1s):
- Feet hit ground
- Knees absorb impact (bend)
- Slight stagger forward
```

### Layout (Diving)

The signature animation. This must look INCREDIBLE.

```
Launch (0.1s):
- Final step is a powerful push-off
- Body angle goes from upright to nearly horizontal
- Arms extend forward (reaching for disc)

Flight (0.2-0.4s):
- Full horizontal extension
- Body parallel to ground, ~0.5-1m above grass
- Arms outstretched, fingers spread
- Legs trail behind, slightly splayed
- Eyes locked on disc
- Time slows down (engine slow-mo)

The Catch Moment (0.05s):
- If successful: hands clamp on disc, body curls around catch
- If miss: fingers graze disc, face shows anguish
- Camera angle maximizes drama

Landing (0.3s):
- Chest/belly hits grass
- Slide forward (1-2m)
- Grass spray from slide
- Arms (with disc) elevated above ground
- Head up, triumphant (if caught)

Recovery (0.5-1.0s):
- Roll to side
- Push up to knees
- Stand up (with swagger if caught)
- Teammates rush in for celebration
```

## Throwing Animations

Each throw type has a distinct, recognizable animation:

### Backhand

```
Phase 1 - Load (0.2-0.5s, scales with power charge):
  - Body coils: torso rotates away from throw direction
  - Throwing arm sweeps back across body, disc behind hip
  - Front shoulder points at target
  - Weight shifts to back foot
  - Non-throwing arm points toward target (balance/aim)

Phase 2 - Release (0.05-0.1s):
  - Explosive hip rotation toward target
  - Torso follows
  - Arm whips through, disc releases from hand
  - Wrist snap at release point
  - Back foot lifts slightly from force

Phase 3 - Follow-through (0.2s):
  - Arm continues forward past release
  - Body faces target
  - Weight on front foot
  - Back arm swings out for balance
  - Eyes follow the disc
```

### Forehand (Flick)

```
Phase 1 - Load (0.15-0.3s):
  - Throwing arm cocks to the side (elbow up, wrist back)
  - Body opens toward throwing side
  - Disc held at hip level with forehand grip
  - Non-throwing arm out for balance

Phase 2 - Release (0.05s):
  - Arm extends sideways
  - WRIST SNAP (the key motion) -- very fast wrist rotation
  - Disc flings out from the side
  - Body steps forward into the throw

Phase 3 - Follow-through (0.15s):
  - Arm extends fully to the side
  - Wrist finishes pointed at target
  - Body faces ~45° from target
```

### Hammer

```
Phase 1 - Load (0.3-0.5s):
  - Arm goes up and behind head
  - Disc held overhead, slightly behind
  - Body leans back
  - Eyes on target (through/over the mark)

Phase 2 - Release (0.08s):
  - Arm sweeps forward and over
  - Disc released at highest point
  - Body leans forward with the throw
  - DRAMATIC wrist action

Phase 3 - Follow-through (0.2s):
  - Arm continues down
  - Body recovers balance
  - Watches disc arc over defenders
  - (If it's a good hammer: slight smirk)
```

### Pump Fake

```
  - Execute Phase 1 (load) of any throw type
  - Abruptly stop at the release point
  - Body recoils back to neutral
  - Disc stays in hand
  - Quick look at the defender's reaction

Good pump fakes make the defender jump or commit. The animation sells the fake by going through the full windup but stopping cold at the last instant.
```

## Catching Animations

### Pancake Catch (Two Hands, Top and Bottom)

```
- Both arms extend to disc trajectory
- One hand above, one below the disc
- Clap together as disc arrives
- Arms pull disc into chest
- Slight backward lean from disc momentum
- Secure hold: disc pressed to torso
```

### Clap Catch (Two Hands, Side by Side)

```
- Both arms extend toward disc
- Hands side by side, forming a net
- Clap together as disc arrives
- More dramatic arm extension than pancake
- Good for catches above head or at full extension
```

### One-Handed Catch

```
- Single arm extends to disc
- Fingers spread wide
- Disc hits palm, fingers wrap around rim
- Body leans/reaches in catch direction
- Looks effortless and cool
- High difficulty = high style
```

### Layout Catch

(See Layout animation above. The catch variant adds):
```
- Hands positioned specifically to grab the disc during flight
- If disc is to the side: body twists mid-air to reach
- If disc is high: one arm extends higher, body arcs
- If disc is low: arms reach down, body skims grass
- The catch itself: small clamp animation of fingers on disc
```

### Sky Catch

```
- Running approach with eyes up
- Explosive jump (biggest jump height in the game)
- At apex: one or both arms extend FULLY overhead
- Catch the disc at the highest point possible
- Body straightens vertical in the air (maximum height expression)
- If contested: body may lean into/over defender
- Landing with disc held high in triumph
```

## Swagger System

The swagger system is what gives FrisQueendom its personality. After certain events, players trigger special swagger animations:

### Trigger Events

| Event | Swagger Level | Description |
|-------|--------------|-------------|
| Clean catch | 1 (Low) | Casual disc toss, slight nod |
| Nice throw | 1 (Low) | Finger guns at receiver, small fist pump |
| Big play (sky, layout) | 2 (Medium) | Chest bump nearest teammate, arm flex |
| Score | 3 (High) | Full celebration sequence |
| Game-winning score | 4 (Maximum) | Extended team celebration |
| Block / Interception | 2-3 | Point-at-attacker, "get that outta here" wave |
| Break point (score on opponent's pull) | 3 (High) | Emphatic team celebration |

### Celebration Animations

**Level 1 - Casual**
```
Options (random selection):
- Disc flip: toss disc up, catch it behind back
- Finger guns at teammate
- Slight head nod with closed eyes ("smooth")
- Quick fist pump
- Disc tap on thigh
```

**Level 2 - Hype**
```
Options:
- Chest bump with nearest teammate
- Double bicep flex
- "Come on!" arm pump
- Spinning disc on finger (brief)
- Running and jumping high-five with teammate
- Point at the crowd
- "Did you see that?!" hands-on-head look at sideline
```

**Level 3 - Score Celebration**
```
Options:
- Spike! (slam disc on ground -- controversial in real ultimate!)
- Team huddle (all stickmen run in, pile arms together)
- Disco point (Saturday Night Fever pose)
- Running belly slide across the endzone
- Coordinated team dance (2-3 players do the same move)
- "Airplane" run with arms out
- Drop disc, walk away in slow-mo
- Knee slide with arm raised
```

**Level 4 - Ultimate Swagger**
```
Extended sequences (3-5 seconds):
- Team dog-pile (everyone dives on the scorer)
- Choreographed celebration (varies by team, can be customized in management mode)
- "The Flow" -- entire team creates a human wave
- Stadium lights flash (if night game)
- Confetti explosion
- Freeze frame → zoom to stickman face → slight smile
```

### Anti-Swagger (Frustration)

When things go badly:

| Event | Animation |
|-------|-----------|
| Drop a catch | Head drop, hands on knees |
| Throw a turnover | Arms thrown up, look of disbelief |
| Get scored on | Hands on hips, look at ground |
| Miss a layout | Face-down in grass for 0.5s extra |
| Get skied | Stare up at the person who just caught it over you |

### Personality-Based Animation Selection

Not all players swagger the same way:

| Personality | Celebration Style |
|-------------|------------------|
| **Hype** | Always big celebrations, gets teammates going |
| **Stoic** | Minimal celebration, nod, business-like |
| **Showboat** | Over-the-top, always looking at crowd |
| **Team-first** | Always runs to celebrate WITH teammates |
| **Quiet confidence** | Subtle but cool. The disc flip. The walk-away. |

Players develop their celebration personality over time in career mode. Fans have favorites.

## Marking Dance

The interaction between the thrower and the mark is a mini-game of body language:

```
Mark animation:
- Athletic stance (knees bent, arms wide)
- Shuffles side-to-side to mirror thrower's pivot
- Arms move to block throwing lanes
- Stall count: body language intensifies as count goes up
  - 1-3: relaxed marking, steady stance
  - 4-6: more active hands, leaning forward
  - 7-9: aggressive, crowding, arms flailing
  - 10: full lunge (if they're counting right)

Thrower animation:
- Pivots around plant foot
- Fakes throws in different directions
- Scans the field (head turns)
- Body language: calm at low stall, rushed at high stall
  - 1-3: smooth, unhurried pivots
  - 4-6: quicker pivots, more fakes
  - 7-9: frantic pivoting, desperate looks
  - 10: last-ditch throw attempt or timeout call
```

## Technical Implementation

### Procedural Bone System

```typescript
class StickmanSkeleton {
  joints: Float32Array;  // 13 joints * 3 components = 39 floats
  rotations: Float32Array; // 13 joints * 1 rotation = 13 floats (2D rotation per joint)

  // Procedural animation functions
  setIdlePose(personality: Personality, time: f32): void;
  setRunPose(speed: f32, phase: f32, lean: f32): void;
  setThrowPose(throwType: ThrowType, phase: f32, power: f32): void;
  setCatchPose(catchType: CatchType, phase: f32, discPos: Vec3): void;
  setCelebrationPose(celebType: CelebType, phase: f32): void;

  // IK
  solveArmIK(side: Side, target: Vec3): void;
  solveLegIK(side: Side, target: Vec3): void;

  // Blending
  blend(other: StickmanSkeleton, factor: f32): StickmanSkeleton;
  additive(overlay: StickmanSkeleton, factor: f32): StickmanSkeleton;
}
```

### Rendering

Each stickman is rendered as a set of Three.js lines and circles:

```typescript
class StickmanRenderer {
  // Geometry: 12 line segments (bones) + 1 circle (head)
  // + optional: 2 circles (hands), jersey triangle mesh

  material: LineBasicMaterial; // Black, 3px width
  headMesh: CircleGeometry;
  jerseyMesh: TriangleGeometry; // Filled with team color

  // Update transforms from skeleton each frame
  updateFromSkeleton(skeleton: StickmanSkeleton): void;

  // LOD: at far camera distances, simplify to fewer joints
  setLOD(distance: f32): void;
}
```

### Performance

With 14 players on field + substitutes + spectators:
- 14 skeletons * 39 floats * 4 bytes = 2,184 bytes of skeleton data
- 14 players * ~13 line segments = 182 line draw calls (or 1 instanced call)
- Procedural animation: ~100 trig operations per player per frame = 1,400 total
- Negligible compared to the field/grass rendering

The animation system should run at the rendering framerate (60fps). No separate animation tick needed.
