# GAPMTN — Gap Mountain Iteration Spike

Comprehensive gap analysis between design docs (00–12) and current implementation.
Organized into implementation phases by dependency order and impact.

---

## Phase 1: Gameplay Depth (Core Mechanics Gaps)

These are missing mechanics that directly affect the on-field experience.

### 1.1 Catch Timing Window
**Design doc**: 04-THROW-MECHANICS §Catching — early/perfect/late timing window
**Current**: Proximity-only catch detection in `Catch.ts`
**Gap**: No timing mechanic. Disc speed, spin, angle don't affect catch difficulty. No bobble/tip/recovery.
**Work**:
- Add `catchPhase: 'early' | 'perfect' | 'late' | 'miss'` based on player-disc timing
- Disc speed → window size (faster = tighter)
- Player catching stat → window expansion
- Layout catches → wider window but higher commitment
- Bobble recovery chance on early/late
- Visual/audio feedback per phase (clean thwap vs fumble sound)
**Files**: `src/gameplay/Catch.ts`, `src/audio/AudioEngine.ts`, `src/rendering/Animation.ts`

### 1.2 Contested Catches
**Design doc**: 04-THROW-MECHANICS §Contested Catches — stat-weighted dice roll
**Current**: First player in radius gets the catch
**Gap**: No offensive vs defensive contest. No height advantage, position advantage, or stat weighting.
**Work**:
- When both attacker and defender are in catch radius, run contested outcome
- Factors: height/jump timing, inside position, catching stat vs block_ability, aggression
- Outcomes: clean catch, interception, both miss (turnover), foul (Spirit system trigger)
- Use deterministic match RNG (not `Math.random`)
**Files**: `src/gameplay/Catch.ts`, `src/gameplay/Spirit.ts`

### 1.3 Pivot Foot Mechanic
**Design doc**: 01-CORE-GAMEPLAY §Pivot Foot, 05-PLAYER-MOVEMENT §Pivot Foot
**Current**: Thrower can walk freely while holding disc
**Gap**: No pivot foot constraint. WASD moves the player, not rotates around pivot.
**Work**:
- When holding disc: WASD rotates facing around pivot point (not translates)
- Shift+WASD moves non-pivot foot (changes release point/angle)
- Travel foul if pivot moves (can be called by defense via Spirit system)
- Marking AI already mirrors — this gives it something real to respond to
**Files**: `src/gameplay/Movement.ts`, `src/entities/Player.ts`, `src/gameplay/Throw.ts`

### 1.4 Quick Pass (Q key)
**Design doc**: 01-CORE-GAMEPLAY §Controls — Q for auto-aim to nearest open teammate
**Current**: Not implemented
**Work**:
- Q key triggers immediate throw to best open teammate
- Reuse AI's "scan for open receivers" logic from `PlayerAI.ts`
- Lower power (dump pass), high accuracy
- Useful panic button at high stall counts
**Files**: `src/InputManager.ts`, `src/gameplay/Throw.ts`, `src/main.ts`

### 1.5 Cut Calls (1-4 keys)
**Design doc**: 01-CORE-GAMEPLAY §Controls — 1-4 to command teammate cuts
**Current**: Not implemented
**Work**:
- Keys 1-4 command the nearest idle cutter to execute: in cut, out cut, deep cut, under cut
- TeamAI receives the command and overrides that player's next decision
- Visual indicator on the commanded player (arrow or flash)
**Files**: `src/InputManager.ts`, `src/ai/TeamAI.ts`, `src/ai/Offense.ts`, `src/main.ts`

### 1.6 Timeout System
**Design doc**: 01-CORE-GAMEPLAY §Controls — C to call timeout
**Current**: Not implemented
**Gap**: No timeout mechanic. No between-point substitution pause.
**Work**:
- C key calls timeout (limited per half, configurable)
- Pauses play, opens substitution/playbook adjustment screen
- AI can also call timeouts under pressure (high stall, bad field position)
- Resume play from same disc position
**Files**: `src/gameplay/Match.ts`, `src/ui/HUD.ts`, `src/InputManager.ts`

### 1.7 Player Foul Calls (V key)
**Design doc**: 01-CORE-GAMEPLAY §Controls — V to call foul
**Current**: Only AI calls fouls. `Spirit.ts:116` returns false for player-controlled fouls.
**Work**:
- V key triggers foul call by controlled player
- Opens contest/accept UI for the accused AI player
- Result feeds into Spirit scoring system (already exists)
**Files**: `src/gameplay/Spirit.ts`, `src/InputManager.ts`, `src/ui/HUD.ts`

### 1.8 Match Configuration Options
**Design doc**: 01-CORE-GAMEPLAY §Scoring — win by 2, point cap, timed halves
**Current**: Fixed score-to-15
**Work**:
- Add to match setup: score target (11/13/15/custom), win-by-2 toggle, point cap, timed halves option
- `Match.ts` already has scoring logic — extend with these rules
- Wire into quick match setup UI in `Menus.ts`
**Files**: `src/gameplay/Match.ts`, `src/ui/Menus.ts`, `src/data/Types.ts`

### 1.9 Disc-Ground Skip Shot
**Design doc**: 02-DISC-PHYSICS §Disc-Ground Interaction — skip shot bounces at predictable angle
**Current**: Rust crate has basic ground stop. No bounce/skip physics.
**Work**:
- In `frisque-physics/src/ground.rs`: implement restitution-based bounce
- Shallow angle + sufficient speed = skip (reduce vertical vel, apply restitution ~0.3)
- Edge catch = cartwheel (angular impulse)
- Nose-in = stick (dramatic stop)
- Expose `ground_interaction_type` getter to TS
**Files**: `frisque-physics/src/ground.rs`, `frisque-physics/src/lib.rs`, `src/physics/DiscBridge.ts`

---

## Phase 2: AI & Strategy Depth

### 2.1 Horizontal Stack Offense
**Design doc**: 05-PLAYER-MOVEMENT §Horizontal Stack
**Current**: TeamAI only runs vertical stack
**Work**:
- Implement horizontal stack formation in `TeamAI.ts`
- Cutters spread across field width in lanes
- Isolation-based cuts (1v1 matchup)
- Handlers look for any open cutter in their lane
- Selectable in playbook (data layer already has `horizontal` formation)
**Files**: `src/ai/TeamAI.ts`, `src/ai/Offense.ts`

### 2.2 Zone Defense
**Design doc**: 05-PLAYER-MOVEMENT §Zone Defense (3-3-1)
**Current**: Man-to-man only
**Work**:
- Implement 3-3-1 zone: cup (mark + 2 wings), 3 mids, 1 deep
- Cup follows the disc, not individual players
- Wings prevent breaks, short-deeps cover mid-range, deep-deep prevents hucks
- Zone shifts as disc swings
- AI opponent can run zone on higher difficulties
**Files**: `src/ai/Defense.ts`, `src/ai/TeamAI.ts`

### 2.3 Zone Offense
**Design doc**: 05-PLAYER-MOVEMENT §Zone Offense
**Current**: Not implemented
**Work**:
- Patient disc movement, swing to find gaps
- Popper sits in soft spots, wings stretch wide
- "Crash" when lane opens
- Only needed once zone defense (2.2) exists
**Files**: `src/ai/Offense.ts`, `src/ai/TeamAI.ts`

### 2.4 AI Difficulty Scaling
**Design doc**: 05-PLAYER-MOVEMENT §AI Difficulty Scaling — Rookie/Pro/Legend
**Current**: Basic difficulty level, no "carry fantasy"
**Work**:
- Rookie: AI teammates high IQ, opponents low IQ
- Pro: balanced
- Legend: AI teammates make mistakes (bad cuts, drops), opponents exploit weaknesses
- Scale: reaction time, throw accuracy variance, poach aggression, read quality
- Wire into existing difficulty setting in match setup
**Files**: `src/ai/PlayerAI.ts`, `src/ai/TeamAI.ts`, `src/data/GameplayConstants.ts`

### 2.5 AI Personality Archetypes
**Design doc**: 05-PLAYER-MOVEMENT §AI Personality Types (Captain, Gunslinger, Grinder, Athlete, Rookie, Veteran)
**Current**: Stats and tendency profiles exist, no named archetypes
**Work**:
- Map existing tendency profiles to named archetypes
- Each archetype sets default ranges for aggression, disc_iq, discipline, clutch
- Surface in roster UI for readability
- Affects celebration selection (ties into swagger system)
**Files**: `src/data/PlayerStats.ts`, `src/ai/PlayerAI.ts`, `src/ai/TeamAI.ts`

---

## Phase 3: Visual Polish & Juice

### 3.1 Slow-Motion System
**Design doc**: 06-ART-DIRECTION §Slow Motion — 25% speed for 0.5-1.0s on big plays
**Current**: Not implemented
**Work**:
- Global `timeScale` multiplier in game loop
- Triggers: layout catch attempts, sky battles, scoring plays, block attempts
- Smooth ramp down (0.1s) → hold (0.5s) → smooth ramp up (0.2s)
- Camera may orbit slightly during slow-mo
- Player setting to disable
**Files**: `src/main.ts`, `src/rendering/PostFX.ts`, `src/data/Types.ts`

### 3.2 Screen Shake
**Design doc**: 06-ART-DIRECTION §Screen Shake — layout landings, scores, blocks
**Current**: Not implemented
**Work**:
- Camera offset noise on trigger events
- Layout landing: medium shake (0.3s)
- Score: subtle shake (0.2s)
- Big block: brief sharp shake (0.15s)
- Amplitude + decay curve, player-disableable
**Files**: `src/rendering/Camera.ts`, `src/rendering/PostFX.ts`

### 3.3 Swagger System (Event-Triggered Celebrations)
**Design doc**: 07-ANIMATION §Swagger System — 4 levels of celebration triggers
**Current**: 4 celebration poses exist (`celebrationPose`, `fistPump`, `spike`, `backflip`) but no event-triggered selection
**Work**:
- Level 1 (clean catch, nice throw): casual nod, finger guns
- Level 2 (sky, layout, block): chest bump, flex, fist pump
- Level 3 (score): spike, team huddle, knee slide
- Level 4 (game-winning score): extended sequence, team dogpile
- Select based on event type + player personality
- Anti-swagger: frustration animations on drops/turnovers (head drop, hands-on-knees)
**Files**: `src/rendering/Animation.ts`, `src/entities/Player.ts`, `src/main.ts`

### 3.4 Stickman Eyes & Mouth
**Design doc**: 06-ART-DIRECTION §Players — two dot eyes, simple mouth line
**Current**: Head is a solid black sphere
**Work**:
- Add two small white/colored dots on head front face (eyes)
- Eyes track disc when in flight, scan field otherwise
- Simple line for mouth: up (happy), down (frustrated), O (shocked)
- Update in `Stickman.ts` — small sprites or geometry on head mesh
**Files**: `src/rendering/Stickman.ts`

### 3.5 Cosmetics Wired to Rendering
**Design doc**: 06-ART-DIRECTION §Player Differentiation — headbands, wristbands, hair
**Current**: `Cosmetics.ts` has data + `applyCosmetic()` but Stickman has no corresponding methods
**Work**:
- Add `setHeadband(color)`, `setWristbands()` to `Stickman`
- Headband: torus around head
- Wristbands: small rings at wrist joints
- Height variation (scale stickman group Y)
- Apply from player's cosmetic data during match setup
**Files**: `src/rendering/Stickman.ts`, `src/rendering/Cosmetics.ts`, `src/entities/Player.ts`

### 3.6 Depth of Field During Aiming
**Design doc**: 06-ART-DIRECTION §Focus Effects — slight DoF during throw aiming
**Current**: PostFX has bloom/vignette/chromatic aberration but no DoF
**Work**:
- Add BokehPass or simple DoF shader to PostFX pipeline
- Activate when charging a throw (background blurs)
- Deactivate on release
- Subtle — mostly affects distant players/field edges
**Files**: `src/rendering/PostFX.ts`

### 3.7 Time of Day / Lighting Presets
**Design doc**: 06-ART-DIRECTION §Lighting — morning, midday, golden hour, sunset, night
**Current**: Sky system exists but no selectable presets
**Work**:
- Define 5 presets in `Sky.ts`: sun position, color temperature, shadow properties, ambient intensity
- Selectable in match setup
- Night mode: stadium lights (directional from above), visible light beams, deep shadows
- Wire into weather/environment selection in Menus
**Files**: `src/rendering/Sky.ts`, `src/ui/Menus.ts`, `src/data/WeatherTypes.ts`

### 3.8 Field Surroundings
**Design doc**: 06-ART-DIRECTION §Surroundings — trees, benches, spectators
**Current**: Not implemented (field floats in space)
**Work**:
- Park setting (default): simplified trees (cone + cylinder), benches (box geometry)
- Tournament setting: temporary fencing, scorer's table
- Stadium: already exists (`Stadium.ts`, 223 lines) — verify it's wired in for stadium venue
- Low priority: ambient stickmen (joggers, spectators) can be deferred
**Files**: `src/rendering/Field.ts`, `src/rendering/Stadium.ts`, new `src/rendering/Environment.ts`

---

## Phase 4: Audio Completeness

### 4.1 Spatial Audio (3D Positioning)
**Design doc**: 09-AUDIO §Spatial Audio — PannerNode, distance attenuation, Doppler
**Current**: All audio is flat stereo
**Work**:
- Add PannerNode to sound emitters (disc, players, crowd)
- Listener position = camera position, orientation = camera forward
- Disc sounds move through stereo field in flight
- Distant player footsteps quieter
- Doppler shift on disc flyby (optional, can be subtle)
**Files**: `src/audio/AudioEngine.ts`

### 4.2 Ambient Environment Sounds
**Design doc**: 09-AUDIO §Environment — birds, traffic, dogs, tents, crowd reactions
**Current**: Crowd audio exists. No birds/traffic/ambient layer.
**Work**:
- Park: bird song oscillators with trills, distant traffic rumble
- Tournament: add PA murmur, tent flapping
- Stadium: large crowd swell on big moments (partially in CrowdAudio)
- Layer volumes based on venue type
**Files**: `src/audio/AudioEngine.ts`, new sounds in existing audio files or `src/audio/AmbientSounds.ts`

### 4.3 UI Sounds
**Design doc**: 09-AUDIO §UI Sounds — menu clicks, score jingle, turnover tone, whistle
**Current**: Not implemented
**Work**:
- Menu click: short sine wave pulse
- Selection: brighter click + harmonic
- Score: ascending major chord arpeggio
- Turnover: brief descending tone
- Timeout/foul: whistle (filtered noise)
- Game start/end: horn blast
**Files**: `src/audio/AudioEngine.ts`, `src/ui/Menus.ts`, `src/gameplay/Match.ts`

### 4.4 Rain Audio
**Design doc**: 09-AUDIO §Rain — white noise, raindrop pings, splashing, thunder
**Current**: Rain weather type exists in data but no audio
**Work**:
- Rain layer: filtered white noise with specific rain character
- Intensity scales with rain level
- Thunder: low-freq rumble + sharp crack (rare, triggered by weather events)
- Player splash sounds when running (modified footstep)
**Files**: `src/audio/AudioEngine.ts`, `src/data/WeatherTypes.ts`

---

## Phase 5: Management Mode Depth

### 5.1 Team Chemistry System
**Design doc**: 08-MANAGEMENT §Chemistry — pairwise player chemistry affecting gameplay
**Current**: Not implemented
**Work**:
- Pairwise chemistry value (-5 to +5) between roster players
- Builds from: shared practice, successful plays together, complementary positions
- Degrades from: competing for roster spots, personality conflicts
- On-field: +3 chemistry → +10% catch rate, better cut timing; -3 → -10%, worse timing
- Display in roster UI
**Files**: `src/data/PlayerStats.ts`, `src/management/Roster.ts`, `src/gameplay/Catch.ts`

### 5.2 Team Culture Traits
**Design doc**: 08-MANAGEMENT §Team Culture — Competitive, Spirited, Athletic, Cerebral, Clutch
**Current**: Not implemented
**Work**:
- Track 5 culture traits as 0-100 values on team
- Competitive: from playing tough teams → better in close games
- Spirited: from high spirit → better recruiting
- Athletic: from physical training → higher physical stats
- Cerebral: from playbook complexity → better AI decisions
- Clutch: from winning close games → composure bonus
**Files**: `src/data/SaveLoad.ts`, `src/management/Career.ts`, `src/data/Types.ts`

### 5.3 Auto-Play Match Simulation
**Design doc**: 08-MANAGEMENT §Auto-Play — resolve match in ~5s from team stats
**Current**: Not implemented
**Work**:
- Simulate match from roster stats, playbook quality, chemistry, morale
- Show: score progression, key plays, stats, spirit report
- Allow intervention (call timeout → adjust playbook, sub, or switch to play mode)
- Deterministic from match seed
**Files**: new `src/management/Simulation.ts`, `src/management/Career.ts`

### 5.4 Scouting System
**Design doc**: 08-MANAGEMENT §Scouting — scout opponents, partial stat reveal
**Current**: Not implemented
**Work**:
- Before tournaments: scout upcoming opponents
- Reveals: formation tendencies, key players, weaknesses
- Costs a practice slot
- Influences pre-match playbook adjustment suggestions
**Files**: `src/management/Career.ts`, new scouting UI in `src/ui/Menus.ts`

### 5.5 Budget & Resources
**Design doc**: 08-MANAGEMENT §Budget — income, expenses, lightweight resource management
**Current**: Not implemented
**Work**:
- Lightweight: tournament entry fees, travel, equipment, field rental
- Income: sponsorships (scale with reputation), fundraising, merch
- Affects: quality of tryout candidates, travel to distant tournaments
- Design doc says "intentionally lightweight" — keep it simple
**Files**: `src/management/Career.ts`, `src/data/SaveLoad.ts`

### 5.6 Management UI Screens
**Design doc**: 10-UI-UX §Career Mode Hub, Roster Screen, Calendar Screen, Playbook UI
**Current**: Career hub exists in `Menus.ts` but thin. No visual playbook editor.
**Work**:
- Roster screen: player cards with stats, drag-and-drop lineup, sort/filter
- Calendar: season overview, tournament registration, practice scheduling
- Playbook: X's and O's field diagram, drag formations, draw cut routes
- Spirit dashboard: team spirit history, awards, incidents
- These are significant UI builds — prioritize roster + calendar, defer playbook visual editor
**Files**: `src/ui/Menus.ts` (or split into new files), `src/management/Playbook.ts`

---

## Phase 6: Progression & Modes

### 6.1 Challenge Mode
**Design doc**: 11-PROGRESSION §Challenge Mode — specific skill scenarios with scoring
**Current**: Daily challenges exist (XP rewards). No structured challenge mode with bronze/silver/gold.
**Work**:
- Challenge categories: throwing, catching, game situations
- Each challenge: setup scenario, success criteria, medal scoring
- "Thread the Needle", "Huck Hero", "Wind Whisperer", etc.
- Completion awards cosmetics + achievement badges
- Accessible from main menu
**Files**: new `src/gameplay/Challenge.ts`, `src/ui/Menus.ts`, `src/data/Progression.ts`

### 6.2 College Season Mode
**Design doc**: 08-MANAGEMENT §College Season — 4-year program, aging out
**Current**: Not implemented
**Work**:
- Shorter season variant of career mode
- 4-year program: freshmen arrive, seniors leave
- Conference play + college nationals
- Different recruiting (high school players, transfers)
- Can reuse most of Career.ts infrastructure
**Files**: `src/management/Career.ts`, `src/ui/Menus.ts`

### 6.3 New Game+ / Prestige
**Design doc**: 11-PROGRESSION §New Game+ — post-nationals restart with bonuses
**Current**: Not implemented
**Work**:
- After winning Nationals: offer prestige restart
- Keep cosmetic unlocks, start with better roster
- Harder difficulty modifiers, prestige badge
**Files**: `src/management/Career.ts`, `src/data/SaveLoad.ts`

### 6.4 Player Profile & Lifetime Stats
**Design doc**: 11-PROGRESSION §Player Profile — aggregate lifetime stats
**Current**: Per-player career stats exist, no aggregate profile screen
**Work**:
- Aggregate: games played, goals, assists, blocks, completion %, longest throw, etc.
- Achievement tracking (50+ achievements)
- Profile screen accessible from main menu
**Files**: `src/data/SaveLoad.ts`, `src/ui/Menus.ts`

---

## Phase 7: Wind & Physics Extensions

### 7.1 Thermal System
**Design doc**: 03-WIND §Thermal System — localized vertical air movements
**Current**: Wind has base + gradient + turbulence + gusts. No thermals.
**Work**:
- Add thermal struct in Rust: position, radius, strength, lifetime
- Updraft in center, downdraft at edges (toroidal flow)
- More prominent in hot weather
- Disc flying through thermal gains/loses altitude
- Visual: heat shimmer or rising particles over thermal location
**Files**: `frisque-physics/src/wind.rs`, `frisque-physics/src/lib.rs`, `src/rendering/Particles.ts`

### 7.2 Aerodynamic Lookup Tables
**Design doc**: 02-DISC-PHYSICS §Aerodynamic Coefficient Lookup — wind-tunnel-derived tables
**Current**: Analytical coefficients (cl_0 + cl_alpha * alpha, etc.)
**Work**:
- Implement `AeroTable` struct with interpolated lookup
- Populate from published research (Potts & Crowther, Hummel, Lorenz)
- More accurate stall behavior, non-linear drag polar
- Low priority — current analytical model plays well. Only pursue for realism purists.
**Files**: `frisque-physics/src/aero.rs`

---

## Phase 8: Mobile & Accessibility

### 8.1 Touch Controls
**Design doc**: 10-UI-UX §Mobile Controls — virtual joystick, throw pad, gesture system
**Current**: Touch detection exists in `InputManager.ts` but no virtual controls UI
**Work**:
- Left thumb: virtual joystick for movement
- Right thumb: throw/catch area (hold + drag = aim + power)
- Bottom bar: sprint toggle, player switch, context action
- Forehand: second finger modifier while charging
- Hyzer: drag clockwise/counter-clockwise on throw pad edge
- Gestures: pinch zoom, two-finger rotate, swipe for pause
- Full mechanical parity with desktop (design doc is explicit about this)
**Files**: new `src/ui/TouchControls.ts`, `src/InputManager.ts`, `src/main.ts`

### 8.2 Accessibility Completions
**Design doc**: 10-UI-UX §Accessibility — colorblind patterns, screen reader, remappable controls
**Current**: `Accessibility.ts` exists (192 lines) with high contrast + colorblind mode
**Gap**: No pattern-based team differentiation, no key remapping UI, no subtitle system for audio cues
**Work**:
- Colorblind: add jersey patterns (stripes, dots, chevrons) not just color swaps
- Key remapping: settings UI for rebinding controls
- Subtitles: visual indicators for stall count voice, "Up!" calls, etc.
- Adjustable HUD element sizes
**Files**: `src/ui/Accessibility.ts`, `src/ui/Menus.ts`, `src/rendering/Stickman.ts`

---

## Phase 9: Scene Transitions & Polish

### 9.1 Loading Transitions
**Design doc**: 10-UI-UX §Loading/Transitions — camera swoops, no loading screens
**Current**: Hard cuts between menu and game
**Work**:
- Menu → game: camera swoops from menu scene to field
- Between points: camera pull-back showing teams lining up
- Half-time: fade to stats overlay
- Post-game: camera elevates to bird's eye, UI slides in
**Files**: `src/main.ts`, `src/rendering/Camera.ts`

### 9.2 Mowing Pattern on Grass
**Design doc**: 06-ART-DIRECTION §Grass — subtle striped mowing pattern
**Current**: Grass is uniform
**Work**:
- Alternating darker/lighter lanes perpendicular to endzones in grass shader
- Subtle effect, just a color multiplier based on `floor(worldPos.z / stripe_width) % 2`
**Files**: `src/rendering/Grass.ts`

### 9.3 IK for Hand Placement
**Design doc**: 07-ANIMATION §IK — 2-bone IK for catching, throwing, marking
**Current**: Procedural poses position hands, no IK solver
**Work**:
- 2-bone IK solver for arm chains (shoulder → elbow → wrist)
- Catching: both hands target disc position
- Throwing: throwing hand targets release point
- Marking: hands target throwing lanes
- Blend IK result with procedural pose
**Files**: `src/rendering/Animation.ts`

### 9.4 Marking Dance Animation
**Design doc**: 07-ANIMATION §Marking Dance — thrower pivots, mark shuffles, intensity escalates
**Current**: Mark AI positions, but no animated marking interaction
**Work**:
- Mark: athletic stance, shuffles to mirror thrower's pivot
- Arms move to block lanes (if IK done, this comes free)
- Stall count escalation: relaxed (1-3) → active (4-6) → aggressive (7-9)
- Thrower: pivot animation when holding disc
**Files**: `src/rendering/Animation.ts`, `src/ai/Marking.ts`

### 9.5 Animation Blending & Additive Layers
**Design doc**: 07-ANIMATION §Animation Blending — base + upper body + head + expression
**Current**: Basic single-pose blending
**Work**:
- Base layer: locomotion (run/jog/idle)
- Upper body override: throw/catch/mark actions
- Head layer: look-at target (disc, field scan)
- Expression layer: eyes/mouth (depends on 3.4)
- Blend weights per layer
**Files**: `src/rendering/Animation.ts`, `src/entities/Player.ts`

---

## Priority Ranking

**Highest impact, most needed for "feels like real ultimate":**
1. Phase 1 (Gameplay Depth) — especially 1.1-1.3, 1.4-1.5
2. Phase 3.1-3.3 (Slow-mo, Screen shake, Swagger) — juice
3. Phase 2.1-2.2 (Horizontal stack, Zone defense) — strategic variety
4. Phase 4.1, 4.3 (Spatial audio, UI sounds) — polish feel

**Medium impact, adds depth:**
5. Phase 5.1-5.3 (Chemistry, Culture, Auto-play) — management depth
6. Phase 3.4-3.7 (Eyes, Cosmetics, DoF, Lighting) — visual personality
7. Phase 6.1 (Challenge mode) — replayability
8. Phase 2.4-2.5 (Difficulty scaling, Personalities) — AI variety

**Lower priority, stretch goals:**
9. Phase 7 (Thermals, Aero tables) — physics purist features
10. Phase 8 (Touch controls, Accessibility completions) — platform reach
11. Phase 9 (Transitions, IK, Mowing pattern) — final polish
12. Phase 5.4-5.6, 6.2-6.4 (Scouting, Budget, College, Prestige) — management completeness

---

## Estimated Scope

| Phase | New/Modified Files | Est. Lines | Complexity |
|-------|-------------------|------------|------------|
| 1. Gameplay Depth | ~10 | ~2,000 | High |
| 2. AI & Strategy | ~5 | ~2,500 | High |
| 3. Visual Polish | ~8 | ~1,500 | Medium |
| 4. Audio | ~4 | ~800 | Medium |
| 5. Management | ~8 | ~3,000 | Medium-High |
| 6. Progression | ~5 | ~1,500 | Medium |
| 7. Wind/Physics | ~3 | ~500 | Medium |
| 8. Mobile/A11y | ~4 | ~1,200 | Medium |
| 9. Polish | ~6 | ~1,000 | Medium |
| **Total** | **~53** | **~14,000** | |

Current codebase: ~39K lines TS + ~2.5K lines Rust. Full gap closure would bring it to ~55K lines.
