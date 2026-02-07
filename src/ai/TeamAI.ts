import * as THREE from 'three';
import type { Player } from '../entities/Player';
import type { Team } from '../entities/Team';
import type { Disc } from '../entities/Disc';
import {
    computeStackPositions,
    computeHorizontalStackPositions,
    computeHandlerPositions,
} from './Offense';
import { assignMatchups, assignZone331Positions } from './Defense';
import type { OffenseFormation, DefenseFormation } from '../data/Types';
import {
    decideOffenseWithDisc,
    decideOffenseWithoutDisc,
    decideDefense,
    moveToward,
} from './PlayerAI';
import { updateMarkMirror } from './Marking';
import type { ThrowParams } from '../data/Types';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

interface AIDifficultyProfile {
    decisionInterval: number;
    activeCutDuration: number;
    reassignInterval: number;
    throwDirectionJitter: number;
    throwSpeedJitter: number;
}

export class TeamAI {
    private matchups = new Map<Player, Player>();
    private zonePositions = new Map<Player, THREE.Vector3>();
    private reassignTimer = 0;
    private decisionTimer = 0;
    private activeCutterIdx = 3; // first cutter
    private cutTimers = new Map<Player, number>();
    private pendingThrow: ThrowParams | null = null;
    private formation: OffenseFormation = 'vertical_stack';
    private defenseType: DefenseFormation = 'man';
    private profile: AIDifficultyProfile = {
        decisionInterval: 0.1,
        activeCutDuration: 3.0,
        reassignInterval: 2.0,
        throwDirectionJitter: 0.03,
        throwSpeedJitter: 0.05,
    };

    setDifficulty(level: AIDifficulty): void {
        if (level === 'easy') {
            this.profile = {
                decisionInterval: 0.18,
                activeCutDuration: 3.4,
                reassignInterval: 2.5,
                throwDirectionJitter: 0.09,
                throwSpeedJitter: 0.15,
            };
            return;
        }

        if (level === 'hard') {
            this.profile = {
                decisionInterval: 0.07,
                activeCutDuration: 2.5,
                reassignInterval: 1.4,
                throwDirectionJitter: 0.015,
                throwSpeedJitter: 0.03,
            };
            return;
        }

        this.profile = {
            decisionInterval: 0.1,
            activeCutDuration: 3.0,
            reassignInterval: 2.0,
            throwDirectionJitter: 0.03,
            throwSpeedJitter: 0.05,
        };
    }

    setFormation(formation: OffenseFormation): void {
        this.formation = formation;
    }

    setDefenseType(defenseType: DefenseFormation): void {
        this.defenseType = defenseType;
    }

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
        const stackPos = this.formation === 'horizontal_stack'
            ? computeHorizontalStackPositions(discPos, attackingEndzone)
            : computeStackPositions(discPos, attackingEndzone);
        const handlerPos = computeHandlerPositions(discPos, attackingEndzone);

        // Manage active cutter rotation
        const cutters = team.players.filter((p) => p.role !== 'handler');
        const handlers = team.players.filter((p) => p.role === 'handler');

        // Update cut timers
        for (const c of cutters) {
            const timer = this.cutTimers.get(c) || 0;
            if (c.index === this.activeCutterIdx) {
                this.cutTimers.set(c, timer + dt);
                if (timer > this.profile.activeCutDuration) {
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
                if (this.decisionTimer > this.profile.decisionInterval) {
                    this.decisionTimer = 0;
                    const action = decideOffenseWithDisc(
                        player,
                        team.players,
                        defenders,
                        stallCount,
                        attackingEndzone,
                    );
                    if (action.type === 'throw' && action.throwParams) {
                        this.pendingThrow = this.applyThrowVariance(action.throwParams);
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
        attackingEndzone: number,
    ): void {
        const discPos = disc.position;
        const discHolder = opponentTeam.getHolder() || null;

        if (this.defenseType === 'zone_331') {
            // Zone defense: assign zone positions periodically
            if (this.reassignTimer > this.profile.reassignInterval) {
                this.reassignTimer = 0;
                this.zonePositions = assignZone331Positions(
                    team.players.filter((p) => !p.isControlled),
                    discPos,
                    attackingEndzone,
                );
            }

            for (const player of team.players) {
                if (player.isControlled) continue;

                const zoneTarget = this.zonePositions.get(player);
                if (zoneTarget) {
                    moveToward(player, zoneTarget, dt, false);
                }

                player.update(dt, null);
            }
        } else {
            // Man-to-man defense: assign matchups periodically
            if (this.reassignTimer > this.profile.reassignInterval) {
                this.reassignTimer = 0;
                this.matchups = assignMatchups(
                    team.players.filter((p) => !p.isControlled),
                    opponentTeam.players,
                );
            }

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
                    discPos,
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
    }

    private applyThrowVariance(throwParams: ThrowParams): ThrowParams {
        const direction = throwParams.direction.clone();
        direction.x += (Math.random() - 0.5) * this.profile.throwDirectionJitter;
        direction.y += (Math.random() - 0.5) * this.profile.throwDirectionJitter;
        direction.z += (Math.random() - 0.5) * this.profile.throwDirectionJitter;
        direction.normalize();

        const speedJitter =
            1 + (Math.random() - 0.5) * this.profile.throwSpeedJitter;

        return {
            ...throwParams,
            direction,
            speed: Math.max(5, throwParams.speed * speedJitter),
        };
    }

    resetForPoint(): void {
        this.matchups.clear();
        this.zonePositions.clear();
        this.cutTimers.clear();
        this.reassignTimer = 0;
        this.decisionTimer = 0;
        this.activeCutterIdx = 3;
    }
}
