import * as THREE from 'three';
import type { Player } from '../entities/Player';
import type { Team } from '../entities/Team';
import type { Disc } from '../entities/Disc';
import {
    computeStackPositions,
    computeHandlerPositions,
} from './Offense';
import { assignMatchups } from './Defense';
import {
    decideOffenseWithDisc,
    decideOffenseWithoutDisc,
    decideDefense,
    moveToward,
} from './PlayerAI';
import { updateMarkMirror } from './Marking';
import type { ThrowParams, TeamSide } from '../data/Types';

export class TeamAI {
    private matchups = new Map<Player, Player>();
    private reassignTimer = 0;
    private decisionTimer = 0;
    private activeCutterIdx = 3; // first cutter
    private cutTimers = new Map<Player, number>();
    private pendingThrow: ThrowParams | null = null;

    update(
        dt: number,
        team: Team,
        opponentTeam: Team,
        disc: Disc,
        isOnOffense: boolean,
        attackingEndzone: number,
        stallCount: number,
    ): ThrowParams | null {
        this.pendingThrow = null;
        this.reassignTimer += dt;
        this.decisionTimer += dt;

        if (isOnOffense) {
            this.updateOffense(
                dt,
                team,
                opponentTeam,
                disc,
                attackingEndzone,
                stallCount,
            );
        } else {
            this.updateDefense(dt, team, opponentTeam, disc, attackingEndzone);
        }

        return this.pendingThrow;
    }

    private updateOffense(
        dt: number,
        team: Team,
        opponentTeam: Team,
        disc: Disc,
        attackingEndzone: number,
        stallCount: number,
    ): void {
        const discPos = disc.position;
        const defenders = opponentTeam.players;

        // Compute formation positions
        const stackPos = computeStackPositions(discPos, attackingEndzone);
        const handlerPos = computeHandlerPositions(discPos, attackingEndzone);

        // Manage active cutter rotation
        const cutters = team.players.filter((p) => p.role !== 'handler');
        const handlers = team.players.filter((p) => p.role === 'handler');

        // Update cut timers
        for (const c of cutters) {
            const timer = this.cutTimers.get(c) || 0;
            if (c.index === this.activeCutterIdx) {
                this.cutTimers.set(c, timer + dt);
                if (timer > 3) {
                    // Rotate active cutter
                    this.cutTimers.set(c, 0);
                    const cutterIndices = cutters.map((cc) => cc.index);
                    const currentIdx = cutterIndices.indexOf(
                        this.activeCutterIdx,
                    );
                    this.activeCutterIdx =
                        cutterIndices[
                            (currentIdx + 1) % cutterIndices.length
                        ];
                }
            }
        }

        for (const player of team.players) {
            if (player.isControlled) continue;

            if (player.holdingDisc) {
                // AI with disc: decide to throw
                if (this.decisionTimer > 0.1) {
                    this.decisionTimer = 0;
                    const action = decideOffenseWithDisc(
                        player,
                        team.players,
                        defenders,
                        stallCount,
                        attackingEndzone,
                    );
                    if (action.type === 'throw' && action.throwParams) {
                        this.pendingThrow = action.throwParams;
                    }
                }
            } else if (player.role === 'handler') {
                // Handler positioning
                const hIdx = handlers.indexOf(player);
                const target = handlerPos[hIdx % handlerPos.length];
                moveToward(player, target, dt, false);
            } else {
                // Cutter
                const isActive = player.index === this.activeCutterIdx;
                const cutTimer = this.cutTimers.get(player) || 0;

                if (isActive) {
                    const action = decideOffenseWithoutDisc(
                        player,
                        discPos,
                        true,
                        cutTimer,
                        attackingEndzone,
                        defenders,
                    );
                    if (action.type === 'move' && action.target) {
                        moveToward(
                            player,
                            action.target,
                            dt,
                            action.sprint ?? false,
                        );
                    }
                } else {
                    // Hold stack position
                    const cIdx = cutters.indexOf(player);
                    const target = stackPos[cIdx % stackPos.length];
                    moveToward(player, target, dt, false);
                }
            }

            // Update animation
            player.update(dt, null);
        }
    }

    private updateDefense(
        dt: number,
        team: Team,
        opponentTeam: Team,
        disc: Disc,
        _attackingEndzone: number,
    ): void {
        // Reassign matchups periodically
        if (this.reassignTimer > 2) {
            this.reassignTimer = 0;
            this.matchups = assignMatchups(
                team.players.filter((p) => !p.isControlled),
                opponentTeam.players,
            );
        }

        const discHolder = opponentTeam.getHolder() || null;

        for (const player of team.players) {
            if (player.isControlled) continue;

            const mark = this.matchups.get(player) || null;
            const isMarker = discHolder !== null && mark === discHolder;

            if (isMarker && discHolder) {
                updateMarkMirror(player, discHolder, dt);
            }

            const action = decideDefense(
                player,
                mark,
                discHolder,
                disc.position,
                isMarker,
            );

            if (action.type === 'move' && action.target) {
                moveToward(
                    player,
                    action.target,
                    dt,
                    action.sprint ?? false,
                );
            }

            player.update(dt, null);
        }
    }

    resetForPoint(): void {
        this.matchups.clear();
        this.cutTimers.clear();
        this.reassignTimer = 0;
        this.decisionTimer = 0;
        this.activeCutterIdx = 3;
    }
}
