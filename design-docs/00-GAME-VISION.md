# FrisQueendom: Game Vision

## One-Liner

A browser-based ultimate frisbee game with absurdly realistic disc physics, stickman swagger, and a team management layer -- the game ultimate players have always wanted and nobody has ever made.

## What Is This

FrisQueendom is the **browser-only, local-play edition** of the frisbee game universe. Its sibling project FrisKingdom is a Rust/Bevy online+local version. FrisQueendom runs entirely in the browser with zero installs, zero accounts, zero servers. Open tab, throw disc, feel the wind.

The game has two interlocking modes:

1. **Play Mode** -- You control a player on the field in 7v7 ultimate frisbee. You throw, cut, catch, defend, and score. The disc obeys real aerodynamic physics. The wind is alive.
2. **Management Mode** -- You build and manage a team across seasons and tournaments. Recruit players, design playbooks, train skills, manage chemistry, climb the ranks.

## Design Pillars

### 1. The Disc Is Sacred

The disc flight model is the soul of this game. It must be so physically accurate that experienced disc golfers and ultimate players nod in recognition. Gyroscopic precession, angle of attack stall, wind gradient interaction, ground effect -- all of it. The disc should *feel* like a disc. When you throw a forehand into a headwind and watch it turn over and ride the wind, you should feel something.

This is not a cosmetic feature. The entire game is built around the premise that if you simulate a disc correctly, gameplay emerges naturally from physics. Throws have character. Wind creates strategy. The field becomes a fluid dynamics problem.

### 2. Stickmen With Souls

The stickman aesthetic is a deliberate choice, not a budget constraint. Stickmen are:
- **Universally readable** -- silhouette-first animation communicates instantly
- **Infinitely expressive** -- exaggerated poses, stretchy limbs, swagger walks
- **Fast to iterate** -- we can have hundreds of animation variants
- **Charming** -- there's something inherently delightful about stickmen doing athletic things

Every stickman should have *personality*. The way they idle, the way they celebrate, the way they mark on defense. Some bounce on their toes. Some stand still like predators. A great catch should trigger a unique celebration. A dropped disc should trigger visible frustration. The stickmen are actors.

### 3. Wind Is A Character

Wind is not just a modifier on disc flight. Wind is a living, breathing character in every point. It shifts, gusts, swirls. You can see it in the grass, feel it in your throws. Reading the wind and adapting is a core skill.

The wind field is a full 2D vector field (with vertical component for updrafts/downdrafts) simulated at high fidelity -- potentially on the GPU. Grass particles, dust, and field flags all visualize the wind so the player can *read* it before throwing.

### 4. Depth Through Simplicity

The controls should be learnable in 30 seconds but have a skill ceiling that takes hundreds of hours to approach. A beginner can pick up and throw a backhand. An expert can throw a low-release inside-out forehand into a crosswind, curving it around a mark into a cutting receiver's hands at full extension.

The management layer adds strategic depth without requiring twitch skills. You can spend hours in management mode without ever playing a point.

### 5. Spirit of the Game

Ultimate frisbee is unique among competitive sports in being self-officiated. Players call their own fouls. Spirit of the Game is real. FrisQueendom should honor this:
- No referees on the field
- Foul calls are part of the game system
- Spirit scores matter in tournament play
- Your team's reputation affects recruiting in management mode
- Aggressive/dirty play has real consequences

## Target Audience

- **Primary**: Ultimate frisbee players who want to see their sport in a game
- **Secondary**: Sports game fans looking for something different
- **Tertiary**: Anyone who's ever thrown a frisbee and thought "this is cool"

## What This Is NOT

- Not a disc golf game (though disc physics overlap significantly)
- Not a casual mobile toss game
- Not an online multiplayer game (that's FrisKingdom)
- Not a simulation that sacrifices fun for realism -- the physics are real but the *game* is fun first

## Technical Constraints (Browser Edition)

- Must run in modern browsers (Chrome, Firefox, Safari, Edge)
- No server required -- fully client-side
- No installation -- single URL
- Target 60fps on mid-range hardware
- Mobile-playable with touch controls (though desktop is the primary target)
- Heavy computation (disc physics, wind field) offloaded to WASM or GPU compute where possible
- Built on Three.js (inherited from Booty Hunt codebase)
- Procedural audio (inherited)
- All assets procedurally generated (inherited)

## Relationship to FrisKingdom

| Aspect | FrisQueendom (this) | FrisKingdom |
|--------|-------------------|-------------|
| Engine | Three.js + WASM | Bevy (Rust) |
| Platform | Browser only | Native + Web |
| Multiplayer | Local only | Online + Local |
| Disc Physics | Shared core (Rust WASM) | Shared core (native Rust) |
| Art Style | Stickman | Stickman (higher fidelity) |
| Management | Full | Full + Online leagues |

The disc physics engine is designed as a standalone Rust crate (`frisque-physics`) that compiles to both native and WASM targets, shared between both projects.

## Success Criteria

1. An ultimate player watches someone play and says "that looks like real ultimate"
2. A non-player watches and says "I want to try throwing a frisbee now"
3. The disc physics make you go "how did they do that in a browser"
4. The management mode is engaging enough to play without ever touching a match
5. The swagger animations make you smile
