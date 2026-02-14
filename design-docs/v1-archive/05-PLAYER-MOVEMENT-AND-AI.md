# Player Movement & AI

## Player Movement

### Movement Model

Players are simulated as physics-driven entities with acceleration, deceleration, and turning inertia. Not instant-response arcade movement -- there's weight and momentum.

```rust
struct PlayerPhysics {
    position: Vec3,
    velocity: Vec3,
    facing: f32,          // radians, direction the body faces
    max_speed: f32,       // m/s (varies by player stat, ~6-9 m/s sprint)
    acceleration: f32,    // m/s^2 (~12-18, depends on agility stat)
    deceleration: f32,    // m/s^2 (~15-25, braking)
    turn_rate: f32,       // rad/s (~8-12, how fast they can change direction)
    sprint_multiplier: f32, // 1.2-1.4x speed when sprinting
    stamina: f32,         // 0-100, depletes while sprinting
    stamina_regen: f32,   // per second while not sprinting
}
```

### Movement States

```
IDLE → JOGGING → SPRINTING → CUTTING → JUMPING → LAYOUT
  ↑       ↑          ↑          ↑         ↓         ↓
  └───────┴──────────┴──────────┴─────────┘    RECOVERY
                                                   ↓
                                                 IDLE
```

| State | Speed | Stamina | Description |
|-------|-------|---------|-------------|
| **Idle** | 0 | Regen fast | Standing still, ready. Can look around. |
| **Jogging** | 40-60% max | Regen slow | Default movement. Sustainable indefinitely. |
| **Sprinting** | 100% max | Drain | Full speed. Drains stamina. |
| **Cutting** | 80-100% max | Drain fast | Sharp direction change. Brief speed penalty then burst. |
| **Jumping** | Maintained | Drain | Vertical leap. Horizontal speed maintained from approach. |
| **Layout** | 100%+ max | Drain heavy | Full diving extension. Can't change direction. Commitment play. |
| **Recovery** | 20-40% max | Regen | After layout or hard cut. Slow for 0.5-1s. |

### Cutting

Cutting (sharp direction changes) is the core of ultimate offense. The cutting system rewards timing and deception:

```
Cut Execution:
1. Player builds speed in one direction (the "setup")
2. Player sharply changes direction (the "cut")
3. Brief deceleration during direction change (0.1-0.2s)
4. Burst of acceleration in new direction (first step explosion)

Cut Quality (determines how sharp/fast the cut is):
- Player agility stat
- Current stamina level
- Speed at initiation (faster = wider turn, but faster total repositioning)
- Angle of cut (90° = standard, 180° = very hard, costs lots of stamina)
```

### Vertical Game

Jump height varies by player:
- Average: ~0.5m vertical
- Athletic: ~0.7m vertical
- Elite: ~0.9m vertical (can sky almost anyone)

Jump timing matters: press Space too early and you're descending when the disc arrives. Press too late and you don't reach it.

### Layout (Diving)

The layout is ultimate's most dramatic play. Press Space while sprinting toward a disc that's out of reach:

```
Layout reach: adds ~2m of horizontal range
Layout height: adds ~0.3m of vertical range
Layout risk: you hit the ground HARD afterward
  - 0.8-1.5s recovery time
  - Stamina cost: 25-40 points
  - Chance of injury (very low, but possible in career mode)

Layout success factors:
  - Distance to disc (must be close enough to reach)
  - Timing (too early = belly flop, too late = disc past you)
  - Direction (must be reasonably aligned)
  - Player layout stat (affects reach and recovery)
```

The layout animation is one of the game's showpiece moments. Full horizontal extension, disc caught at fingertips, sliding across grass. Slow-motion trigger.

### Stamina System

```
Max stamina: 100
Sprint drain: 15/s
Cut drain: 10 per cut (instant)
Layout drain: 30 per layout (instant)
Jog regen: 5/s
Idle regen: 15/s

Stamina < 30: movement speed reduced by (30 - stamina)%
Stamina < 10: cannot sprint, cuts are sluggish
```

Stamina management is a strategic element. A player who sprints constantly will be gassed by the end of a long point. Fresh legs make better cuts.

### Pivot Foot

When holding the disc, the thrower must maintain a pivot foot (as per ultimate rules):

```
- One foot stays planted (pivot foot)
- The player can rotate around the pivot to change throwing angle
- The non-pivot foot can step in any direction (creates throwing fakes)
- Moving the pivot foot = Travel foul (can be called by defense)

In-game:
- When holding disc, WASD rotates around pivot rather than moving
- Pressing Shift + WASD moves the non-pivot foot (changes release point)
- This creates the marking dance: thrower pivots to find an opening, marker mirrors
```

## AI System

All non-controlled players are AI-driven. The AI must be good enough that:
1. Teammates make smart cuts and throws without babysitting
2. Opponents feel like real ultimate players, not bots
3. The AI produces recognizable ultimate patterns (stacks, swings, etc.)

### AI Architecture

```
                    ┌─────────────┐
                    │ Game State  │
                    │ Awareness   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Strategic  │  "What should happen?"
                    │   Layer     │  (Team-level decisions)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Tactical   │  "What should I do?"
                    │   Layer     │  (Individual decisions)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Execution  │  "How do I do it?"
                    │   Layer     │  (Movement and actions)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Animation  │  Physical response
                    │   Output    │
                    └─────────────┘
```

### AI Determinism

For replay fidelity and fair challenge validation:
- AI decisions execute on fixed decision ticks (10Hz/5Hz as specified), not frame time.
- Any stochastic tiebreakers (e.g., similarly scored throw options) use deterministic match RNG streams.
- Decision evaluation over candidate sets must be order-stable (sort by stable player IDs before scoring/selecting).

### Strategic Layer (Team AI)

The strategic layer manages team-level decisions. It runs at ~2Hz (every 0.5s) and sets the general plan:

#### Offensive Strategies

**Vertical Stack**
```
Formation:
  H  H  H           (Handlers near disc)
     |
     C
     |
     C               (Cutters in a vertical line)
     |
     C
     |
     C

Behavior:
- Cutters queue in a stack along the field's center
- Front cutter initiates: cuts IN (toward disc) or DEEP (away)
- If they cut in: next cutter goes deep
- If they cut deep: next cutter comes under
- Handlers swing disc side-to-side, looking for open cutter
- Clear out if not open (run through and re-stack)
```

**Horizontal Stack**
```
Formation:
  H  H  H           (Handlers in a line, centered)

  C     C     C     C  (Cutters spread across the field)

Behavior:
- Cutters are spread across the field width
- Each cutter has a "lane" they work
- Cuts are more isolation-based (1v1 matchup)
- Handlers look for any cutter who gets open in their lane
- More free-form, relies on individual play-making
```

**Zone Offense** (against zone defense)
```
Formation:
  H  H               (Handlers work the disc)
     H                (Popper: sits in soft spots of the zone)
  C     C             (Wings: stretch the zone sideline-to-sideline)
     C                (Deep: waits for over-the-top)
     C                (Deep: waits for over-the-top)

Behavior:
- Patient disc movement, swinging to find gaps
- Popper (usually a handler) moves to open pockets in the zone
- Wings stretch wide to create throwing lanes
- "Crash" when a lane opens -- send disc through the gap
```

#### Defensive Strategies

**Man-to-Man (Person)**
```
Each defender is assigned an offensive player:
- Stay within 2-3m of your mark at all times
- When your mark cuts, follow them
- Mark tightly: the closest defender to the thrower forces to one side

Variations:
- Straight-up mark (force middle -- both sides available, less aggressive)
- Forehand force (push thrower to throw backhand)
- Backhand force (push thrower to throw forehand)
- Home/away force (force toward/away from sideline)
```

**Zone Defense**
```
Formation (3-3-1 zone):
  Cup:  M              (Mark: on the thrower)
       W   W           (Wings: clog throwing lanes on each side)

  Mids: S     S        (Short-deeps: cover mid-range)
        S              (Third short-deep: rover)

  Deep:    D           (Deep-deep: prevent hucks)

Behavior:
- Cup follows the disc, not individual players
- Wings prevent easy breaks and resets
- Short-deeps take away mid-range throws
- Deep-deep prevents any throw over the top
- Shift as a unit when the disc swings
```

**Clam / Junk Defense**
A hybrid: some defenders play man, others play zone. Confusing for the offense.

### Tactical Layer (Individual AI)

Each AI player makes individual decisions based on:

```rust
struct PlayerAI {
    // Current decision
    action: AIAction,
    target_position: Vec3,
    urgency: f32,

    // Personality (influences decision-making)
    aggression: f32,      // 0-1: willingness to make risky plays
    disc_iq: f32,         // 0-1: reads the field, anticipates
    discipline: f32,      // 0-1: sticks to the playbook vs freelancing
    clutch: f32,          // 0-1: performance in high-pressure situations

    // Awareness
    visible_players: Vec<PlayerRef>,
    knows_disc_location: bool,
    knows_stall_count: u8,
    estimated_wind: Vec3,
}

enum AIAction {
    // Offense with disc
    LookForThrow { scan_timer: f32 },
    ThrowTo { target: PlayerRef, throw_type: ThrowType },
    PumpFake { direction: Vec3 },
    CallTimeout,

    // Offense without disc
    Stack { position_in_stack: usize },
    CutIn { lane: CutLane },
    CutDeep { lane: CutLane },
    ClearOut { direction: Vec3 },
    SetPick { target: PlayerRef },  // not legal in ultimate! But AI might "accidentally" do it
    ComeBackForReset,

    // Defense
    Mark { force_direction: ForceDirection },
    GuardReceiver { mark: PlayerRef },
    Poach { lane: Vec3 },
    SwitchMark { new_mark: PlayerRef },
    BidForBlock { disc_position: Vec3 },
    LayoutBlock { disc_position: Vec3 },

    // General
    Sprint { target: Vec3 },
    Jog { target: Vec3 },
    Rest,
    Celebrate,
}
```

### Decision-Making: Offense With Disc

```
Every 0.1s (10Hz):
  1. Scan the field for open receivers:
     - For each teammate: estimate "openness"
       - Distance from nearest defender
       - Whether they're cutting or stationary
       - Whether the throwing lane is clear
       - Their current speed (moving target = harder throw)

  2. Check stall count:
     - < 5: patience, look for good options
     - 5-7: increase urgency, consider riskier throws
     - 8-9: PANIC, throw to any open option or call timeout
     - 10: turnover (should never happen with decent AI)

  3. Evaluate each potential throw:
     throw_score = openness * 0.4
                 + yardage_gained * 0.2
                 + throw_difficulty * -0.2 (harder = lower score)
                 + wind_factor * -0.1
                 + risk * aggression * 0.1

  4. Best throw > threshold? Execute.
     Otherwise: pivot, pump fake, or dump to reset.
```

### Decision-Making: Offense Without Disc (Cutting)

```
Every 0.2s (5Hz):
  1. Am I in the right position per the playbook?
     - If not: jog to position (stack, lane, etc.)

  2. Is it my turn to cut? (based on stack position, timing)
     - If yes: choose cut direction
       - Read defender's position and momentum
       - If defender is shading deep: cut in
       - If defender is shading under: cut deep
       - If defender is flat-footed: fake one way, cut the other

  3. Am I open?
     - If yes: signal for the disc (raise hand, look at thrower)
     - If open but thrower doesn't throw: continue cut for 1-2s then clear

  4. Am I clogging? (standing in a throwing lane without being involved)
     - If yes: clear out, re-stack

  5. Is the stall count high and no one's open?
     - Come back for a dump/reset (survival mode)
```

### Decision-Making: Defense

```
Every 0.1s (10Hz):
  If marking the thrower:
    1. Position body to force throws to one side
    2. Mirror thrower's pivot movements
    3. Active hands: move arms to block throwing lanes
    4. If thrower winds up: attempt handblock (success based on stats)
    5. Call stall count (visual/audio feedback)

  If guarding a cutter:
    1. Stay between mark and the disc (deny the cut)
    2. When mark cuts:
       - Shuffle to maintain position
       - If beaten: sprint to recover
       - If disc is thrown to your mark: go for the block or interception
    3. When disc is thrown elsewhere: maintain position, don't bite on fakes

  If poaching:
    1. Leave assigned mark to clog a throwing lane
    2. Gamble: if you read the throw correctly → interception
    3. If wrong: your mark is wide open → big gain for offense
```

### AI Personality Types

Different AI players have distinct play styles based on their personality stats:

| Type | Aggression | Disc IQ | Discipline | Behavior |
|------|-----------|---------|------------|----------|
| **Captain** | Medium | Very High | High | Makes safe choices, reads the field brilliantly |
| **Gunslinger** | Very High | Medium | Low | Attempts hero throws, goes for big plays |
| **Grinder** | Low | High | Very High | Plays the system perfectly, never deviates |
| **Athlete** | High | Low | Medium | Relies on speed/height, less cerebral |
| **Rookie** | Medium | Low | Low | Makes mistakes, but enthusiastic |
| **Veteran** | Medium | Very High | High | Rarely makes errors, clutch in big moments |

### AI Difficulty Scaling

| Difficulty | AI Teammate | AI Opponent |
|-----------|------------|-------------|
| **Rookie** | High IQ, helps you | Low IQ, slow reactions |
| **Pro** | Medium IQ, reliable | Medium IQ, competitive |
| **Legend** | Low IQ, makes mistakes | Very High IQ, exploits weaknesses |

At Legend difficulty, AI opponents:
- Read your throwing patterns and adjust defense
- Poach effectively
- Execute complex zone defenses
- Make spectacular defensive plays
- Exploit your AI teammates' weaknesses

At Legend difficulty, AI teammates:
- Sometimes cut at bad times
- Occasionally drop catchable discs
- Miss open targets when throwing
- Force you to be the playmaker

This creates the "carry" fantasy: you must be exceptional to win at Legend.

## Player Stats

Each player (controlled and AI) has stats that affect their physical and mental performance:

```rust
struct PlayerStats {
    // Physical
    speed: f32,           // 1-99: top sprint speed
    acceleration: f32,    // 1-99: first-step quickness, cut sharpness
    endurance: f32,       // 1-99: stamina pool and regen rate
    jumping: f32,         // 1-99: vertical leap
    layout_reach: f32,    // 1-99: how far they can dive

    // Throwing
    throw_power: f32,     // 1-99: maximum throw distance
    throw_accuracy: f32,  // 1-99: release consistency
    throw_variety: f32,   // 1-99: which advanced throws they can execute well
    break_throw: f32,     // 1-99: ability to break the mark

    // Catching
    catching: f32,        // 1-99: catch reliability
    contested_catch: f32, // 1-99: catching in traffic / 50-50 situations
    sky: f32,             // 1-99: high-point ability

    // Mental
    field_vision: f32,    // 1-99: reads the field, finds open players
    decision_making: f32, // 1-99: throw selection, risk assessment
    composure: f32,       // 1-99: performance under pressure

    // Defense
    marking: f32,         // 1-99: forcing effectiveness, handblock ability
    positioning: f32,     // 1-99: defensive positioning, read-and-react
    block_ability: f32,   // 1-99: getting Ds and interceptions

    // Spirit
    spirit: f32,          // 1-99: sportsmanship, Spirit of the Game
}
```

## Collision & Contact

Ultimate is a non-contact sport. The collision system enforces this:

- Players have soft-body collision volumes (they push each other apart gently)
- Running into a player slows both down (no hard stops)
- If a defender contacts an offensive player during a play on the disc → foul
- Incidental contact is ignored (realistic)
- Dangerous plays (reckless bids) trigger automatic fouls

The collision feel should be "squishy" -- stickmen bump and jostle but don't clip through each other or bounce off hard.
