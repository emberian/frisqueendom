# FrisQueendom Design Documents

Browser-only, local-play ultimate frisbee game with stickman aesthetics and obsessively detailed disc physics.

## Documents

| # | Document | Description |
|---|----------|-------------|
| 00 | [Game Vision](00-GAME-VISION.md) | Design pillars, what makes this game unique, target audience, project scope |
| 01 | [Core Gameplay](01-CORE-GAMEPLAY.md) | Ultimate frisbee rules, match flow, controls, turnovers, camera, weather |
| 02 | [Disc Physics](02-DISC-PHYSICS.md) | 6-DOF flight model, aerodynamic forces, gyroscopic precession, integration, ground interaction |
| 03 | [Wind System](03-WIND-SYSTEM.md) | Wind field simulation, turbulence, gusts, thermals, GPU compute, visualization |
| 04 | [Throw Mechanics](04-THROW-MECHANICS.md) | All throw types, input system, aiming, power, release angles, pump fakes, catching |
| 05 | [Player Movement & AI](05-PLAYER-MOVEMENT-AND-AI.md) | Movement physics, cutting, stamina, AI architecture, offensive/defensive strategies, player stats |
| 06 | [Art Direction](06-ART-DIRECTION.md) | Stickman design, color palette, field rendering, lighting, particles, procedural assets |
| 07 | [Animation System](07-ANIMATION-SYSTEM.md) | Procedural skeleton, locomotion, throw/catch animations, swagger/celebration system |
| 08 | [Management Mode](08-MANAGEMENT-MODE.md) | Team management, recruiting, playbook design, season structure, morale, chemistry |
| 09 | [Audio Design](09-AUDIO-DESIGN.md) | Procedural audio, disc/player/environment sounds, dynamic music, spatial audio |
| 10 | [UI/UX](10-UI-UX.md) | HUD design, menus, settings, mobile controls, replay system, accessibility |
| 11 | [Progression](11-PROGRESSION.md) | Game modes, career mode, unlockables, challenges, tutorial, save system |
| 12 | [Technical Architecture](12-TECHNICAL-ARCHITECTURE.md) | Tech stack, module layout, WASM crate, game loop, performance targets, build pipeline |

## Sibling Project

**FrisKingdom** (`~/dev/friskingdom`) is the Rust/Bevy online+local version. The disc physics Rust crate (`frisque-physics`) is shared between both projects -- compiled to native for FrisKingdom, to WASM for FrisQueendom.
