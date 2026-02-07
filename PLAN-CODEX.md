# PLAN-CODEX

## Product Direction
Goal: deliver a browser game that feels like "FIFA but Ultimate Frisbee" with strong first-impression presentation, readable controls, and repeatable match-day excitement for kids.

Core promise:
- Fast to enter, hard to master.
- Looks like a polished sports broadcast, not a prototype.
- Every match has hype moments (intro package, crowd reactions, final whistle).

## Active Slices

### Slice A: Match Day Atmosphere (Now)
Status: `in progress`

Design:
- Layered crowd ambience with dynamic intensity from game state.
- Big-play crowd swells on goals/blocks.
- Broadcast intro package before opening pull.
- Pull countdown package at match start and each point reset.

Acceptance criteria:
- Audio ambience ramps up when match is close/tense.
- Intro card shows both teams, lineup, game target.
- Pull input is locked until countdown completes.

### Slice B: Core FIFA-Like Match Presentation (Now)
Status: `in progress`

Design:
- Crest-like team identity in scoreboard.
- Final whistle package with:
  - final score,
  - player of the match,
  - top performers table,
  - match event timeline.

Acceptance criteria:
- Match transitions cleanly into post-match package at game-winning point.
- Package is dismissible and returns to menu without leaks/errors.

## Next Slices

### Slice C: Halftime + Broadcast Break
Status: `implemented`

Design:
- Halftime card at midpoint (`gameTo` dependent).
- Compact stats compare (turnovers, completion %, long throws).
- Momentum indicator.

Acceptance criteria:
- Halftime appears once per match and does not break flow.
- Includes compact compare for turnovers, completion %, long throw, plus momentum bar.

### Slice D: Kid-Friendly Progress Hooks
Status: `planned`

Design:
- After-match XP and unlock meter.
- Challenge cards (e.g., "2 goals", "no stall turnover") that rotate daily.
- Cosmetic unlock pings (jersey accents, disc trails, celebration styles).

Acceptance criteria:
- At least one meaningful progression signal after every match.

### Slice E: First-Match Onboarding
Status: `planned`

Design:
- 5-step adaptive onboarding:
  1. Move,
  2. Sprint,
  3. Throw,
  4. Catch/switch,
  5. Score.
- Hints auto-retire after success.

Acceptance criteria:
- New users complete first point without confusion on available actions.

### Slice F: Spectator Director Mode
Status: `in progress`

Design:
- Watch-only mode with no required player inputs.
- Director camera presets (auto, broadcast, disc, home focus, away focus).
- Clear transport controls (pause/play + speed presets + keyboard parity).
- Status rail showing active camera, speed, phase, and offense.

Acceptance criteria:
- A match can run start-to-finish with no user gameplay actions.
- Spectator controls are discoverable on desktop and touch.
- Camera mode and speed changes are instant and legible.

### Slice G: Mobile Control Legibility
Status: `in progress`

Design:
- Compact top HUD at phone + tablet widths to prevent score/wind/phase collisions.
- Touch controls split into core actions vs advanced tools to reduce clutter.
- Mobile removes keyboard hint chips when touch controls are active.

Acceptance criteria:
- No overlap among score, wind, and phase chips from small phones to tablets.
- Core throw/move controls remain reachable with thumbs in portrait mode.
- Advanced throw modifiers stay accessible but non-intrusive.

## Implementation Notes

- Keep all presentation overlays in isolated UI modules (`src/ui/*`) with clear lifecycle (`show/update/hide/destroy`).
- Avoid pausing via menu state for match packages; use in-match presentation locks to preserve camera/FX continuity.
- Keep overlays mobile-safe (`max-height`, scroll containers, no fixed-width assumptions).

## Risks

- Too many overlays can create UI fatigue; enforce short durations and clear skip/continue actions.
- Audio synth complexity can spike CPU; prefer lightweight noise layers and simple filters.
- Match-state transitions are delicate; gate logic with explicit flags and phase transition checks.

## Definition of Done For This Iteration

- Match intro + countdown + crowd excitement + final whistle summary are all integrated and validated by:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
