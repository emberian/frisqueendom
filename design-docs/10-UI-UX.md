# UI/UX Design

## Design Principles

1. **Get out of the way**: During gameplay, the UI should be minimal. The field and the action are the stars.
2. **Information at a glance**: Critical info (stall count, score, wind) must be instantly readable.
3. **Depth on demand**: Detailed stats, playbooks, and management screens accessible but not forced.
4. **Consistent language**: Use ultimate frisbee terminology throughout (not generic sports terms).
5. **Touch-friendly**: All UI must work with mouse, keyboard, and touch (mobile).

## In-Game HUD

### During Active Play (Minimal HUD)

```
┌─────────────────────────────────────────────────────────┐
│ HOME 8        14:32 / Q2       AWAY 7                   │  ← Scoreboard (top center)
│                                                          │
│  ↑ 12 mph                                               │  ← Wind indicator (top left)
│  ╱                                                       │
│                                                          │
│                                                          │
│                                                          │
│                                                          │
│                                                          │
│                        ▂▃▅▇  STALL 6                    │  ← Stall meter (when disc held)
│                                                          │
│                                                          │
│                                                          │
│ ██████████░░░░                                           │  ← Stamina bar (bottom left)
│ [E] Switch  [Q] Quick Pass  [F] Fake                    │  ← Context controls (bottom)
└─────────────────────────────────────────────────────────┘
```

### HUD Elements

**Scoreboard** (top center)
- Team names/colors
- Score for each team
- Current quarter/half (if timed)
- Point count (if untimed)
- Small: who's on offense (arrow indicator)

**Wind Indicator** (top left)
- Compass-style arrow showing wind direction relative to field
- Speed readout (m/s or mph, player choice)
- Color: green → yellow → orange → red based on intensity
- Gust warning: flashes/pulses when gust approaching
- Small flag icon that animates with the wind

**Stall Count** (center, above player when holding disc)
- Horizontal bar that fills from left to right
- Numbers 1-10 tick along the bar
- Colors: green (1-5) → yellow (6-7) → orange (8-9) → red (10)
- Pulses at 7+, shakes at 9+
- Optional: synthesized voice count accompanies visual
- Disappears when disc is thrown

**Stamina Bar** (bottom left)
- Horizontal bar showing current stamina
- Fills green → yellow → red as it depletes
- Regenerates when not sprinting (visible refill animation)
- Flash warning when stamina critically low

**Context Controls** (bottom center)
- Shows currently available actions based on game state
- Changes dynamically:
  - With disc: throw, fake, quick pass, timeout
  - Without disc (offense): sprint, cut, call for disc
  - Defense: mark, bid, switch
- Fades out when player is experienced (option to always show)

**Minimap** (bottom right, optional)
- Top-down view of the field
- Dots for players (colored by team)
- Disc position
- Toggle on/off with M key
- Useful for field awareness, especially when controlling a cutter

### Throw Aiming Overlay

When holding left mouse to throw:

```
  - Trajectory preview arc appears (dotted line extending from disc)
  - Power meter: circular gauge around the player that fills with hold time
    - Green zone: good power
    - Red zone: overcharge
  - Release angle indicator: small disc icon tilted to show hyzer/anhyzer
  - Target reticle: where the disc is predicted to land
  - Wind arrows along the trajectory showing influence
  - Receiver indicators: open teammates have a green circle, covered have red
```

## Menus

### Title Screen

```
┌──────────────────────────────────────────┐
│                                          │
│          F R I S Q U E E N D O M         │  ← Title (custom font, animated)
│          ─ ─ ─ ─ ─ ─ ─ ─ ─ ─            │
│                                          │
│         ▶ Quick Match                    │
│         ▶ Career Mode                    │
│         ▶ Practice                       │
│         ▶ Challenges                     │
│         ▶ Settings                       │
│                                          │
│                                          │  ← Animated stickman throwing disc
│                                          │     in the background
│                                          │
│          [Any key to continue]           │
└──────────────────────────────────────────┘
```

Background: animated field scene with stickmen doing warmup throws. Disc trails criss-cross the sky. Wind blows the grass. Dynamic lighting cycle (time of day shifts slowly).

### Quick Match Setup

```
Step 1: Choose teams
  - Two team selector panels side by side
  - Each shows team name, colors, overall rating
  - 16+ preset teams + your career team(s)

Step 2: Match settings
  - Score to: 11 / 13 / 15 / custom
  - Timed: yes/no (if yes: half length)
  - Wind: calm / breezy / windy / gusty / random
  - Time of day: morning / midday / evening / night
  - Field: park / tournament / stadium
  - Difficulty: rookie / pro / legend

Step 3: Ready
  - Both teams shown in lineup
  - Weather preview
  - "Start Match" button
```

### Career Mode Hub

```
┌────────────────────────────────────────────────────┐
│  MY TEAM: [Team Name]          Season 3, Week 12   │
│  Record: 24-8    Ranking: #7                       │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  ROSTER  │ │ PLAYBOOK │ │ CALENDAR │           │
│  │  20/27   │ │  3 Sets  │ │ Next: Sat│           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ SCOUTING │ │ TRAINING │ │  SPIRIT  │           │
│  │ 2 Reports│ │ This Week│ │  Score:A │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                     │
│  [!] Tryouts available  [!] Tournament this weekend│
│                                                     │
│  ▶ Continue to Next Event                          │
└────────────────────────────────────────────────────┘
```

### Pause Menu (In-Game)

```
┌──────────────────────────┐
│       P A U S E D        │
│                          │
│   ▶ Resume               │
│   ▶ Playbook (adjust)    │
│   ▶ Substitutions        │
│   ▶ Match Stats          │
│   ▶ Settings             │
│   ▶ Quit to Menu         │
│                          │
│   Score: HOME 8 - AWAY 7 │
│   Time: Q2 14:32         │
└──────────────────────────┘
```

### Post-Game Screen

```
┌──────────────────────────────────────────────┐
│              FINAL SCORE                      │
│                                               │
│      HOME 15    ─────    AWAY 12             │
│                                               │
│  ┌─ HIGHLIGHTS ──────────────────────────┐   │
│  │ ★ Player X: 4 goals, 3 assists        │   │
│  │ ★ Player Y: 3 blocks, 1 layout D      │   │
│  │ ★ Player Z: 200m thrown, 0 turnovers  │   │
│  └───────────────────────────────────────┘   │
│                                               │
│  ┌─ STATS ───────────────────────────────┐   │
│  │           HOME        AWAY            │   │
│  │ Points:    15          12             │   │
│  │ Breaks:     4           2             │   │
│  │ Turnovers:  8          11             │   │
│  │ Completions: 87%       82%            │   │
│  │ Hucks:      5 (3 comp) 4 (2 comp)    │   │
│  │ Blocks:     6           3             │   │
│  │ Spirit:    ★★★★☆      ★★★☆☆         │   │
│  └───────────────────────────────────────┘   │
│                                               │
│  ▶ Watch Replay    ▶ Continue                │
└──────────────────────────────────────────────┘
```

## Settings Screen

```
GAMEPLAY
  Difficulty: [Rookie] [Pro] [Legend]
  Throw Assist: [Strong] [Light] [None]
  Catch Assist: [Generous] [Moderate] [Realistic]
  Auto-Switch Player: [On] [Off]
  Trajectory Preview: [Full] [Short] [Off]
  Stall Count Style: [Visual] [Visual + Audio] [Audio Only]
  Camera: [Smart Follow] [Broadcast] [Top-Down]

DISPLAY
  Quality: [Low] [Medium] [High] [Ultra]
  Grass Detail: [Off] [Low] [High]
  Particles: [Off] [Low] [High]
  Wind Visualization: [Off] [Subtle] [Full]
  Slow Motion: [On] [Off]
  Show FPS: [On] [Off]
  Nerd Mode (physics debug): [On] [Off]

AUDIO
  Master Volume: ████████░░ 80%
  Music Volume: ██████░░░░ 60%
  SFX Volume: █████████░ 90%
  Ambient Volume: ███████░░░ 70%
  Spatial Audio: [On] [Off]
  Stall Count Voice: [On] [Off]

CONTROLS
  Key Bindings: [View / Edit]
  Mouse Sensitivity: ██████████ 100%
  Invert Y: [On] [Off]
  Touch Controls: [Auto] [On] [Off]
  Vibration: [On] [Off]

UNITS
  Wind Speed: [m/s] [mph] [km/h] [knots]
  Distance: [meters] [yards]
  Temperature: [°C] [°F]
```

## Mobile Controls

### Touch Layout

```
┌──────────────────────────────────────┐
│  Score / Wind / Stall (top bar)      │
│                                      │
│                                      │
│                                      │
│                                      │
│                                      │
│                                      │
│  ┌────┐                   ┌────┐    │
│  │MOVE│                   │THROW   │ ← Right thumb: throw actions
│  │JOY │                   │    │    │   Tap: quick throw
│  │STICK│                  │    │    │   Hold + drag: aim + power
│  └────┘                   └────┘    │   Double-tap: fake
│                                      │
│  [SPRINT]  [SWITCH]  [SPECIAL]       │ ← Bottom bar: action buttons
└──────────────────────────────────────┘

Left thumb: virtual joystick for movement
Right thumb: throw/catch actions (contextual)
Bottom bar: sprint toggle, player switch, context action
```

### Touch Throw Aiming

- Hold right thumb on screen to begin throw
- Drag to aim (relative to player)
- Hold duration = power (same as mouse)
- Lift thumb = release
- Two-finger hold = forehand grip
- Swipe up during hold = hammer

### Touch Gestures

- Pinch: zoom camera
- Two-finger drag: rotate camera
- Double-tap empty field: recenter camera
- Swipe from edge: open pause menu

## Replay System UI

After each point (and accessible from post-game):

```
┌──────────────────────────────────────────────┐
│  REPLAY                              [X]     │
│                                              │
│  [Camera View ▼]                             │
│                                              │
│                                              │
│              (3D replay view)                │
│                                              │
│                                              │
│                                              │
│  ◀◀  ◀  ▶ ▮▮  ▶▶  |  0.25x  0.5x  1x  2x  │  ← Playback controls
│  ════════════╤══════════════════════════      │  ← Timeline scrubber
│                                              │
│  [Disc Cam] [Broadcast] [Free Cam] [Bird]    │  ← Camera presets
│  [Show Trails] [Show Stats] [Show Wind]      │  ← Overlay toggles
└──────────────────────────────────────────────┘
```

## Loading / Transitions

- No loading screens (procedural everything = instant)
- Scene transitions: camera swoops from menu scene to field
- Between points: brief camera pull-back showing both teams lining up
- Half-time: fade to stats overlay, fade back
- Post-game: camera slowly elevates to bird's eye, UI slides in

## Accessibility

- High contrast mode (thicker lines, more saturated colors)
- Colorblind mode (team differentation via patterns, not just color)
- Screen reader support for menus (ARIA labels)
- Remappable controls
- Adjustable text size
- Adjustable HUD element sizes
- Option to disable screen shake, slow-mo, and flash effects
- Subtitles for audio cues (stall count, calls)
