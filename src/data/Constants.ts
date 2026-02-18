// Field dimensions (meters)
export const FIELD_LENGTH = 100;
export const FIELD_WIDTH = 37;
export const ENDZONE_DEPTH = 18;
export const PLAYING_FIELD_LENGTH = FIELD_LENGTH - 2 * ENDZONE_DEPTH; // 64m
export const BRICK_MARK_DISTANCE = 20; // from endzone line

// Physics
export const PHYSICS_DT = 1 / 240; // 240Hz fixed timestep
export const SUBSTEPS_PER_FRAME = 4; // at 60fps

// Player
export const PLAYER_JOG_SPEED = 6.0; // m/s
export const PLAYER_SPRINT_SPEED = 9.0; // m/s
export const PLAYER_ACCELERATION = 15.0; // m/s^2
export const PLAYER_DECELERATION = 20.0; // m/s^2
export const STAMINA_MAX = 100;
export const STAMINA_SPRINT_DRAIN = 15; // per second
export const STAMINA_JOG_REGEN = 5; // per second
export const STAMINA_IDLE_REGEN = 15; // per second

// Stall count
export const STALL_DURATION = 7; // seconds (tuned for arcade pacing)
export const STALL_MAX = 7;

// Catch
export const CATCH_RADIUS = 0.8; // meters, standing catch
export const LAYOUT_CATCH_RADIUS = 2.5; // meters, diving catch

// Colors
export const TEAM_A_PRIMARY = 0x1a73e8; // blue
export const TEAM_A_SECONDARY = 0xffffff;
export const TEAM_B_PRIMARY = 0xe81a1a; // red
export const TEAM_B_SECONDARY = 0xffffff;
