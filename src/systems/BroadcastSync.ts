import type { LanRelayClient } from '../network/LanRelayClient';
import type { FullMatchState, RoomMetadata } from '../network/protocol';
import type { Disc } from '../entities/Disc';
import type { Player } from '../entities/Player';
import type { Match } from '../gameplay/Match';
import type { TeamSide, MatchPhase } from '../data/Types';

/**
 * Configuration for BroadcastSync.
 */
export interface BroadcastSyncConfig {
    /** The LAN relay client to send through. */
    lanClient: LanRelayClient;
    /** Whether this instance is a spectator (receive-only). */
    isSpectator: boolean;
    /** The multiplayer mode (for metadata joinable flag). */
    multiplayerMode: string;
    /** The random seed for the match. */
    matchSeed: number;
}

/**
 * BroadcastSync manages the periodic broadcasting of game state over the
 * LAN relay, as well as the metadata updates for the lobby browser.
 *
 * Extracted from the broadcastState/metadata sections of main.ts's game loop.
 *
 * Usage:
 *   const sync = new BroadcastSync(config);
 *   // In game loop:
 *   sync.update(dt, match, disc, allPlayers, homeTeamName, awayTeamName);
 *   // On cleanup:
 *   sync.destroy();
 */
export class BroadcastSync {
    private readonly lanClient: LanRelayClient;
    private readonly isSpectator: boolean;
    private readonly multiplayerMode: string;
    private readonly matchSeed: number;

    private broadcastStateTimer = 0;
    private metadataTimer = 0;

    /** Broadcast rate: 60Hz state, 0.5Hz metadata. */
    private readonly stateBroadcastInterval = 0.0166; // ~60Hz
    private readonly metadataBroadcastInterval = 2.0; // 0.5Hz

    constructor(config: BroadcastSyncConfig) {
        this.lanClient = config.lanClient;
        this.isSpectator = config.isSpectator;
        this.multiplayerMode = config.multiplayerMode;
        this.matchSeed = config.matchSeed;
    }

    /**
     * Call each frame. Accumulates time and broadcasts state/metadata
     * at the configured intervals.
     */
    update(
        dt: number,
        match: Match,
        disc: Disc,
        allPlayers: ReadonlyArray<Player>,
        homeTeamName: string,
        awayTeamName: string,
    ): void {
        // Spectators do not broadcast
        if (this.isSpectator) return;

        // State broadcast at ~60Hz
        this.broadcastStateTimer += dt;
        if (this.broadcastStateTimer >= this.stateBroadcastInterval) {
            this.broadcastStateTimer = 0;

            const state: FullMatchState = {
                timestamp: performance.now(),
                disc: {
                    pos: {
                        x: disc.position.x,
                        y: disc.position.y,
                        z: disc.position.z,
                    },
                    vel: {
                        x: disc.velocity.x,
                        y: disc.velocity.y,
                        z: disc.velocity.z,
                    },
                    state: disc.state,
                },
                players: allPlayers.map((p) => ({
                    id: p.id,
                    pos: {
                        x: p.movement.position.x,
                        z: p.movement.position.z,
                    },
                    facing: p.movement.facing,
                    anim: p.getAnimState(),
                    animTime: p.getAnimTimer(),
                    holding: p.holdingDisc,
                    marking: p.isMarking,
                    markPct: p.markStallIntensity,
                    accent: this.getPlayerAccent(p),
                })),
                score: [...match.score] as [number, number],
                stall: match.point.stallCount,
                phase: match.phase,
                offenseTeam: match.offenseTeam,
                statusText: match.statusText,
                statusTextActive: match.statusTextActive,
                randomSeed: this.matchSeed,
            };

            this.lanClient.broadcastState(state);
        }

        // Metadata broadcast at ~0.5Hz
        this.metadataTimer += dt;
        if (this.metadataTimer >= this.metadataBroadcastInterval) {
            this.metadataTimer = 0;

            const metadata: Partial<RoomMetadata> = {
                homeName: homeTeamName,
                awayName: awayTeamName,
                homeScore: match.score[0],
                awayScore: match.score[1],
                phase: match.phase,
                joinable: this.multiplayerMode !== 'single',
            };

            this.lanClient.updateMetadata(metadata);
        }
    }

    /**
     * Reset internal timers. Useful after pauses.
     */
    resetTimers(): void {
        this.broadcastStateTimer = 0;
        this.metadataTimer = 0;
    }

    /**
     * Clean up. Currently a no-op since the LanRelayClient lifecycle
     * is managed by the caller, but provided for consistency.
     */
    destroy(): void {
        // LanRelayClient is owned by the caller, not by this system.
        // Nothing to clean up here.
    }

    // ── Private ──

    /**
     * Extract the accent color string from a player's stickman.
     * Uses the same approach as the original main.ts code.
     */
    private getPlayerAccent(p: Player): string | null {
        const stickman = p.stickman as unknown as Record<string, unknown>;
        if (stickman.accentMesh) {
            const mesh = stickman.accentMesh as {
                material: { color: { getHex(): number } };
            };
            return (
                '#' +
                mesh.material.color
                    .getHex()
                    .toString(16)
                    .padStart(6, '0')
            );
        }
        return null;
    }
}
