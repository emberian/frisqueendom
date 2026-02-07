# Core Gameplay

## The Sport: Ultimate Frisbee

Ultimate is a 7v7 non-contact sport played on a rectangular field. Teams score by catching the disc in the opposing endzone. The player with the disc cannot run -- they must throw to a teammate. If a throw is dropped, goes out of bounds, or is intercepted/blocked, possession switches (a "turnover"). The game is self-officiated under Spirit of the Game.

FrisQueendom simulates this faithfully, with adaptations for the fact that you control one player at a time.

## Field Dimensions

```
|<------------ 100m (110yd) total ----------->|
|                                               |
|  ENDZONE    PLAYING FIELD        ENDZONE      |
|  (18m)      (64m / 70yd)        (18m)        |
|             ← brick mark (20m from endzone)   |
|                                               |
|<--37m (40yd) wide----------------------------------->|
```

The field is rendered in 3D with perspective. The grass has procedural texture with visible wind effects (blades bending, ripples). Field lines are painted on the ground. Cones mark the corners.

## Match Structure

### Point Flow

```
Pull (kickoff)
  → Offense works disc up field (pass, cut, catch, repeat)
    → Score (catch in endzone) → point awarded, reset
    → Turnover (drop, block, out of bounds, stall) → defense becomes offense
      → Work disc up field...
```

### Scoring

- First to **15 points** wins (configurable)
- Win by 2 (optional)
- **Half** at 8 points -- teams switch endzones
- **Point cap** at 17 (hard cap, optional)
- Each point starts with a pull (kickoff throw)

### Timing (Optional)

- Regulation games can optionally use timed halves (common in semi-pro)
- FrisQueendom supports both point-based and timed formats
- Default: point-based (more natural for the game)

### Stall Count

When the disc is held by a player, a **stall count** from 1 to 10 begins. The defender (marker) counts aloud. If the thrower hasn't released by "stalling ten," it's a turnover. This creates urgency.

In-game: a visible stall meter fills up. At 7+, it pulses urgently. The stall count speed varies by difficulty.

## Player Roles & Positions

### Offense

- **Handlers** (2-3): The playmakers. High throwing skill, field vision. Usually positioned near the disc. Think of them as point guards.
- **Cutters** (4-5): The athletes. Fast, good at catching. Run routes to get open. Think wide receivers.
  - **Deep cutters**: Specialize in long runs downfield
  - **Unders cutters**: Specialize in short, sharp cuts

### Defense

- **Mark**: The player directly guarding the thrower. Forces throws to one side.
- **Downfield defenders**: Guard cutters, try to block or intercept throws.
- **Poach**: A defender leaves their mark to clog a lane (risky but effective).

### Your Role

You control **one player at a time**. By default, you control:
- **On offense with disc**: The thrower
- **On offense without disc**: A cutter (the "primary" cutter)
- **On defense**: The mark OR a downfield defender (toggle)

Your 6 teammates are AI-controlled. Their behavior depends on the playbook (see `08-MANAGEMENT-MODE.md`) and their individual stats/tendencies.

## Controls

### Movement (WASD / Left Stick)

| Input | Action |
|-------|--------|
| W/S | Move forward/backward relative to camera |
| A/D | Strafe left/right |
| Shift (hold) | Sprint (drains stamina) |
| Space | Jump / Layout (dive for disc) |
| E | Switch controlled player |

### Throwing (When holding disc)

| Input | Action |
|-------|--------|
| Left Mouse (hold) | Begin throw -- hold to charge power |
| Mouse Position | Aim direction (relative to player facing) |
| Right Mouse (hold) | Modify: hold for forehand (default is backhand) |
| Scroll Wheel | Adjust release angle (hyzer ↔ anhyzer) |
| Q | Quick pass (auto-aim to nearest open teammate) |
| F | Fake throw (pump fake to freeze defenders) |
| 1-4 | Call for specific cut (command teammate to cut in/out/deep/under) |

### Defense

| Input | Action |
|-------|--------|
| Left Mouse | Attempt block/handblock (when marking) |
| Right Mouse | Attempt interception (when downfield, bid for disc) |
| Space | Layout block (diving attempt -- risky but spectacular) |
| Tab | Switch to mark nearest receiver |

### General

| Input | Action |
|-------|--------|
| C | Call timeout (limited per half) |
| V | Call foul (triggers Spirit of the Game system) |
| Tab | Cycle controlled player |
| P / Esc | Pause menu |

### Throw Aiming System

The throw direction is determined by mouse position relative to the player:

1. A **throw arc preview** appears when holding left mouse, showing the predicted disc flight path (accounting for current wind)
2. The preview updates in real-time as you aim
3. Release timing affects throw quality:
   - Too quick: less power, less spin, more wobble
   - Sweet spot: clean release, intended power
   - Too long: slight telegraphing, defenders react

The preview arc uses the full disc physics simulation (see `02-DISC-PHYSICS.md`) to show where the disc will actually go. This is one of the game's signature features -- you're throwing *with* the physics, not against them.

## Turnovers

A turnover (change of possession) occurs when:

| Turnover Type | Condition |
|--------------|-----------|
| **Drop** | Receiver fails to catch the disc |
| **Block** | Defender knocks the disc away |
| **Interception** | Defender catches the disc |
| **Out of bounds** | Disc lands out of bounds |
| **Stall out** | Thrower holds disc past stall count 10 |
| **Hand block** | Mark blocks the throw at release |
| **Strip** (foul) | Defender strips disc from receiver's hands (foul in real ultimate; contested → replay) |
| **Travel** (foul) | Thrower moves their pivot foot (minor; disc goes back, replay) |

After a turnover, disc is picked up where it landed (or at the nearest point in-bounds for OB throws). The new offense can start immediately.

## The Pull (Kickoff)

Each point starts with a pull:

1. Pulling team lines up on their endzone line
2. Receiving team lines up on their endzone line
3. One player throws the pull (a long throw downfield)
4. Receiving team catches or picks up the disc
5. Play begins

**Pull mechanics**: The pull is a special long throw. You control the puller and aim/power the throw. A good pull is a strategic weapon:
- **Deep pull**: Forces offense to work the full field
- **Short pull with lots of spin**: "Floaty" pull that gives your team time to get downfield
- **OB pull**: Risky -- offense gets disc at the brick mark (20m from your endzone)

The pull also demonstrates the disc physics beautifully -- pulling is one of the longest throws in ultimate, and the disc's full flight characteristics are on display.

## The Flow

A typical point in FrisQueendom:

1. **Pull**: Your team receives. You're controlling a handler.
2. **Pickup**: A teammate catches the pull, you sprint to get the disc.
3. **Reset**: Teammate dumps the disc back to you (handler). Stall count resets.
4. **Survey**: You see the field. Two cutters are making moves. The wind is blowing from the left.
5. **Throw**: You hold left mouse, adjust for wind (forehand into the wind so it holds the line), release to a cutter making an under cut.
6. **Switch**: Auto-switch to the cutter who caught it. Another handler is cutting for a reset. A deep cutter is streaking downfield.
7. **Huck**: The deep cutter is open! You charge a big backhand, account for the crosswind, and send it deep.
8. **Sky**: Auto-switch to the deep cutter. You and the defender both jump. You press Space at the right time for a layout catch in the endzone.
9. **SCORE!** Stickman does a celebration dance. Your team runs in for chest bumps. Point to you.

## Difficulty Settings

| Setting | Rookie | Pro | Legend |
|---------|--------|-----|--------|
| Stall count speed | Slow (12s) | Normal (10s) | Fast (8s) |
| AI teammate intelligence | High | Medium | Low |
| AI opponent intelligence | Low | Medium | Very High |
| Wind variability | Low | Medium | Chaotic |
| Throw assist | Strong | Light | None |
| Catch assist | Generous | Moderate | Realistic |
| Layout catch difficulty | Easy | Medium | Punishing |

## Game Modes

### Quick Match
Pick two teams, set options, play a game. Fastest way to play.

### Career Mode
See `11-PROGRESSION.md` and `08-MANAGEMENT-MODE.md`. Full season/tournament progression.

### Practice Mode
Free-form practice on a field. No opponents. Just you, the disc, the wind, and cones.
- Throw at targets
- Practice specific throws
- Learn wind reading
- Experiment with physics (nerd mode debug overlays available)

### Challenges
Specific scenarios to complete:
- "Score from this position in 3 throws or fewer"
- "Complete a full huck in 30mph wind"
- "Score using only forehand throws"
- "Win a point from 14-14"
- "Layout catch in the endzone"

## Spirit of the Game System

Ultimate is self-officiated. FrisQueendom honors this:

- Fouls are called by the fouled player (press V)
- The accused player can **contest** or **accept** the call
- If contested: disc goes back to thrower, play restarts (in real rules this is more nuanced; simplified for game flow)
- If accepted: appropriate remedy applied

Spirit affects:
- **Team spirit score**: Tracked per team. High spirit → bonus to recruiting in management mode
- **Individual reputation**: Players known for bad spirit get called more
- **Crowd reaction**: The invisible crowd reacts to good/bad spirit

This is unique to ultimate and to FrisQueendom. No other sports game has this.

## Camera

### Default: Smart Follow Cam

- Camera follows the action intelligently
- When you have the disc: over-the-shoulder, slightly elevated
- When cutting: pulled back wider to show the field
- When disc is in the air: dynamic tracking shot following the disc
- Slow-mo triggers on spectacular plays (layouts, sky attempts, hammer catches)

### Alternative Camera Modes

- **Broadcast**: Fixed sideline camera with smooth panning (TV-style)
- **Top-down**: Tactical view showing the full field (good for management-focused players)
- **Disc Cam**: Camera attached to the disc (nausea warning, but spectacular for replays)
- **Free Cam**: Detached camera for replay viewing

## Weather & Environment

Every match has weather conditions that affect gameplay:

| Condition | Effect |
|-----------|--------|
| **Calm** | Minimal wind. Best for learning. |
| **Breezy** | Moderate wind. Affects long throws. |
| **Windy** | Strong wind. Changes strategy significantly. |
| **Gusty** | Unpredictable gusts. Chaotic but exciting. |
| **Rain** | Wet disc = higher drop chance, disc slides on ground |
| **Cold** | Players fatigue slower but disc feels "dead" (less glide) |
| **Hot** | Players fatigue faster, thermals create updrafts |

Time of day affects lighting and visibility:
- Morning (golden hour, low sun, long shadows)
- Midday (harsh overhead light, clear visibility)
- Sunset (dramatic lighting, sun in your eyes on one side)
- Night/lights (tournament under stadium lights, atmospheric)
