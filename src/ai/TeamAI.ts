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
import { Random } from '../data/SeededRandom';
import type { Formation, Play } from '../data/SaveLoad';
import { FIELD_WIDTH } from '../data/Constants';

export type AIDifficulty = 'easy' | 'normal' | 'hard';
export type AIPersonality =
    | 'balanced'
    | 'patient_small_ball'
    | 'huck_heavy'
    | 'poach_chaos';

interface AIDifficultyProfile {
    decisionInterval: number;
    activeCutDuration: number;
    reassignInterval: number;
    throwDirectionJitter: number;
    throwSpeedJitter: number;
    secondaryCutChance: number;
    poachChance: number;
    switchDistance: number;
}

interface ScriptedCut {
    playerRole: 'handler' | 'cutter';
    timing: number;
    startX: number;
    startZ: number;
    endX: number;
    endZ: number;
    priority: number;
}

interface AITendencyProfile {
    aggression: number;
    tempo: number;
    widthBias: number;
    defenseFlex: number;
}

interface AIPersonalityModifiers {
    aggression: number;
    tempo: number;
    widthBias: number;
    defenseFlex: number;
    decisionIntervalMult: number;
    secondaryCutMult: number;
    poachMult: number;
    switchDistanceMult: number;
    deepBias: number;
    resetBias: number;
    forceSwapRate: number;
}

const PERSONALITY_MODIFIERS: Record<AIPersonality, AIPersonalityModifiers> = {
    balanced: {
        aggression: 0,
        tempo: 0,
        widthBias: 0,
        defenseFlex: 0,
        decisionIntervalMult: 1.0,
        secondaryCutMult: 1.0,
        poachMult: 1.0,
        switchDistanceMult: 1.0,
        deepBias: 0,
        resetBias: 0,
        forceSwapRate: 1.0,
    },
    patient_small_ball: {
        aggression: -0.18,
        tempo: -0.12,
        widthBias: 0.1,
        defenseFlex: 0.06,
        decisionIntervalMult: 1.12,
        secondaryCutMult: 0.82,
        poachMult: 0.88,
        switchDistanceMult: 1.08,
        deepBias: -0.18,
        resetBias: 0.24,
        forceSwapRate: 0.82,
    },
    huck_heavy: {
        aggression: 0.2,
        tempo: 0.08,
        widthBias: 0.06,
        defenseFlex: -0.04,
        decisionIntervalMult: 0.9,
        secondaryCutMult: 1.2,
        poachMult: 0.92,
        switchDistanceMult: 0.95,
        deepBias: 0.3,
        resetBias: -0.14,
        forceSwapRate: 0.92,
    },
    poach_chaos: {
        aggression: 0.06,
        tempo: 0.04,
        widthBias: -0.02,
        defenseFlex: 0.28,
        decisionIntervalMult: 0.95,
        secondaryCutMult: 1.05,
        poachMult: 1.45,
        switchDistanceMult: 0.82,
        deepBias: 0.04,
        resetBias: 0.05,
        forceSwapRate: 1.4,
    },
};

export class TeamAI {
    private matchups = new Map<Player, Player>();
    private zonePositions = new Map<Player, THREE.Vector3>();
    private reassignTimer = 0;
    private decisionTimer = 0;
    private activeCutterIdx = 3;
    private cutTimers = new Map<Player, number>();
    private lastActiveCutterIndices: number[] = [];
    private pendingThrow: ThrowParams | null = null;
    private formation: OffenseFormation = 'vertical_stack';
    private defenseType: DefenseFormation = 'man';
    private difficultyLevel: AIDifficulty = 'normal';
    private personality: AIPersonality = 'balanced';
    private personalityMods = PERSONALITY_MODIFIERS.balanced;
    private tendency: AITendencyProfile = {
        aggression: 0.5,
        tempo: 1.0,
        widthBias: 0.5,
        defenseFlex: 0.5,
    };
    private forceSide: 1 | -1 = 1;
    private forceSwapTimer = 2.0;
    private lastHelpDefenderIndex: number | null = null;
    private customFormation:
        | Array<{ role: 'handler' | 'cutter'; x: number; z: number }>
        | null = null;
    private scriptedCuts: ScriptedCut[] = [];
    private baseProfile: AIDifficultyProfile = {
        decisionInterval: 0.1,
        activeCutDuration: 3.0,
        reassignInterval: 2.0,
        throwDirectionJitter: 0.03,
        throwSpeedJitter: 0.05,
        secondaryCutChance: 0.35,
        poachChance: 0.16,
        switchDistance: 8.5,
    };
    private profile: AIDifficultyProfile = {
        decisionInterval: 0.1,
        activeCutDuration: 3.0,
        reassignInterval: 2.0,
        throwDirectionJitter: 0.03,
        throwSpeedJitter: 0.05,
        secondaryCutChance: 0.35,
        poachChance: 0.16,
        switchDistance: 8.5,
    };

    setDifficulty(level: AIDifficulty): void {
        this.difficultyLevel = level;
        if (level === 'easy') {
            this.baseProfile = {
                decisionInterval: 0.18,
                activeCutDuration: 3.4,
                reassignInterval: 2.5,
                throwDirectionJitter: 0.09,
                throwSpeedJitter: 0.15,
                secondaryCutChance: 0.16,
                poachChance: 0.08,
                switchDistance: 10.0,
            };
            this.applyPersonalityToProfile();
            this.rollTendencyProfile(level);
            return;
        }

        if (level === 'hard') {
            this.baseProfile = {
                decisionInterval: 0.07,
                activeCutDuration: 2.5,
                reassignInterval: 1.4,
                throwDirectionJitter: 0.015,
                throwSpeedJitter: 0.03,
                secondaryCutChance: 0.58,
                poachChance: 0.3,
                switchDistance: 7.0,
            };
            this.applyPersonalityToProfile();
            this.rollTendencyProfile(level);
            return;
        }

        this.baseProfile = {
            decisionInterval: 0.1,
            activeCutDuration: 3.0,
            reassignInterval: 2.0,
            throwDirectionJitter: 0.03,
            throwSpeedJitter: 0.05,
            secondaryCutChance: 0.35,
            poachChance: 0.16,
            switchDistance: 8.5,
        };
        this.applyPersonalityToProfile();
        this.rollTendencyProfile(level);
    }

    setPersonality(personality: AIPersonality): void {
        this.personality = personality;
        this.personalityMods = PERSONALITY_MODIFIERS[personality];
        this.applyPersonalityToProfile();
        this.rollTendencyProfile(this.difficultyLevel);
    }

    setFormation(formation: OffenseFormation): void {
        this.formation = formation;
    }

    setDefenseType(defenseType: DefenseFormation): void {
        this.defenseType = defenseType;
    }

    setPlaybookContext(formation: Formation | null, play: Play | null): void {
        if (formation?.positions?.length) {
            this.customFormation = formation.positions.slice(0, 7).map((position) => ({
                role: position.role,
                x: position.x,
                z: position.z,
            }));
        } else {
            this.customFormation = null;
        }

        if (play?.cuts?.length) {
            this.scriptedCuts = [...play.cuts]
                .sort((a, b) => a.timing - b.timing || b.priority - a.priority)
                .map((cut) => ({
                    playerRole: cut.playerRole,
                    timing: cut.timing,
                    startX: cut.startX,
                    startZ: cut.startZ,
                    endX: cut.endX,
                    endZ: cut.endZ,
                    priority: cut.priority,
                }));
        } else {
            this.scriptedCuts = [];
        }
    }

    update(
        dt: number,
        team: Team,
        opponentTeam: Team,
        disc: Disc,
        isOnOffense: boolean,
        attackingEndzone: number,
        stallCount: number,
        windSpeed: number = 0,
        windDir: number = 0,
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
                windSpeed,
                windDir,
            );
        } else {
            this.updateDefense(
                dt,
                team,
                opponentTeam,
                disc,
                attackingEndzone,
                stallCount,
            );
        }

        return this.pendingThrow;
    }

    getDebugActiveCutters(): number[] {
        return [...this.lastActiveCutterIndices];
    }

    getDebugForceSide(): number {
        return this.forceSide;
    }

    getDebugHelpDefenderIndex(): number | null {
        return this.lastHelpDefenderIndex;
    }

    getDebugPersonality(): AIPersonality {
        return this.personality;
    }

    getDebugTendency(): {
        aggression: number;
        tempo: number;
        widthBias: number;
        defenseFlex: number;
    } {
        return { ...this.tendency };
    }

    getDebugProfile(): {
        decisionInterval: number;
        activeCutDuration: number;
        reassignInterval: number;
        throwDirectionJitter: number;
        throwSpeedJitter: number;
        secondaryCutChance: number;
        poachChance: number;
        switchDistance: number;
    } {
        return { ...this.profile };
    }

    private updateOffense(
        dt: number,
        team: Team,
        opponentTeam: Team,
        disc: Disc,
        attackingEndzone: number,
        stallCount: number,
        windSpeed: number,
        windDir: number,
    ): void {
        const discPos = disc.position;
        const defenders = opponentTeam.players;
        const dir = attackingEndzone === 0 ? -1 : 1;

        const stackPos =
            this.customFormation && this.customFormation.length > 0
                ? this.customFormation
                      .filter((position) => position.role === 'cutter')
                      .map(
                          (position) =>
                              new THREE.Vector3(
                                  discPos.x + position.x,
                                  0,
                                  discPos.z - dir * position.z,
                              ),
                      )
                : this.formation === 'horizontal_stack'
                ? computeHorizontalStackPositions(discPos, attackingEndzone)
                : computeStackPositions(discPos, attackingEndzone);
        const handlerPos =
            this.customFormation && this.customFormation.length > 0
                ? this.customFormation
                      .filter((position) => position.role === 'handler')
                      .map(
                          (position) =>
                              new THREE.Vector3(
                                  discPos.x + position.x,
                                  0,
                                  discPos.z - dir * position.z,
                              ),
                      )
                : computeHandlerPositions(discPos, attackingEndzone);
        if (stackPos.length === 0) {
            stackPos.push(...computeStackPositions(discPos, attackingEndzone));
        }
        if (handlerPos.length === 0) {
            handlerPos.push(...computeHandlerPositions(discPos, attackingEndzone));
        }

        const cutters = team.players.filter(
            (p) => p.role !== 'handler' && !p.isControlled && !p.holdingDisc,
        );
        const handlers = team.players.filter(
            (p) => p.role === 'handler' && !p.isControlled && !p.holdingDisc,
        );
        const sidelinePressure = Math.abs(discPos.x) > FIELD_WIDTH * 0.34;
        const activeCutterIndices = this.chooseActiveCutters(
            cutters,
            defenders,
            discPos,
            attackingEndzone,
            stallCount,
            sidelinePressure,
            dt,
        );
        this.lastActiveCutterIndices = [...activeCutterIndices];
        const hasHandlerScript = this.scriptedCuts.some(
            (cut) => cut.playerRole === 'handler',
        );
        const hasCutterScript = this.scriptedCuts.some(
            (cut) => cut.playerRole === 'cutter',
        );

        for (const player of team.players) {
            if (player.isControlled) continue;

            if (player.holdingDisc) {
                const decisionWindow =
                    this.profile.decisionInterval /
                    THREE.MathUtils.clamp(this.tendency.tempo, 0.82, 1.2);
                if (this.decisionTimer > decisionWindow) {
                    this.decisionTimer = 0;
                    const action = decideOffenseWithDisc(
                        player,
                        team.players,
                        defenders,
                        stallCount,
                        attackingEndzone,
                        windSpeed,
                        windDir,
                    );
                    if (action.type === 'throw' && action.throwParams) {
                        this.pendingThrow = this.applyThrowVariance(
                            action.throwParams,
                        );
                    }
                }
                player.update(dt, null);
                continue;
            }

            const roleKey: 'handler' | 'cutter' =
                player.role === 'handler' ? 'handler' : 'cutter';
            const roleIndex =
                roleKey === 'handler'
                    ? handlers.indexOf(player)
                    : cutters.indexOf(player);
            const previousTimer = this.cutTimers.get(player) || 0;
            const shouldAdvanceTimer =
                roleKey === 'handler'
                    ? hasHandlerScript
                    : activeCutterIndices.has(player.index) || hasCutterScript;
            const cutTimer = shouldAdvanceTimer
                ? previousTimer + dt
                : Math.max(0, previousTimer - dt * 0.6);
            this.cutTimers.set(player, cutTimer);

            const scriptedTarget = this.getScriptedCutTarget(
                roleKey,
                Math.max(0, roleIndex),
                cutTimer,
                discPos,
                dir,
            );
            if (scriptedTarget) {
                moveToward(
                    player,
                    scriptedTarget.target,
                    dt,
                    scriptedTarget.sprint,
                );
                player.update(dt, null);
                continue;
            }

            if (roleKey === 'handler') {
                const baseTarget =
                    handlerPos[Math.max(0, roleIndex) % handlerPos.length];
                const handlerTarget = baseTarget.clone();
                if (sidelinePressure) {
                    const centerBias = -discPos.x * (0.42 + this.tendency.widthBias * 0.2);
                    handlerTarget.x = THREE.MathUtils.clamp(
                        handlerTarget.x * 0.45 + centerBias * 0.55,
                        -FIELD_WIDTH * 0.45,
                        FIELD_WIDTH * 0.45,
                    );
                    if (stallCount >= 5) {
                        handlerTarget.z -= dir * 2.5;
                    }
                }
                moveToward(player, handlerTarget, dt, stallCount >= 8);
                player.update(dt, null);
                continue;
            }

            if (activeCutterIndices.has(player.index)) {
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
                const cIdx = cutters.indexOf(player);
                if (stallCount >= 7) {
                    const emergency = new THREE.Vector3(
                        discPos.x + (cIdx % 2 === 0 ? -6 : 6),
                        0,
                        discPos.z - dir * 4,
                    );
                    moveToward(player, emergency, dt, true);
                } else if (sidelinePressure && stallCount < 6) {
                    const weakSide = -Math.sign(discPos.x || 1) * FIELD_WIDTH * 0.32;
                    const weakFlood = new THREE.Vector3(
                        THREE.MathUtils.clamp(
                            weakSide + (cIdx - 1) * 2.4,
                            -FIELD_WIDTH * 0.47,
                            FIELD_WIDTH * 0.47,
                        ),
                        0,
                        discPos.z + dir * (6 + cIdx * 2.2),
                    );
                    moveToward(player, weakFlood, dt, cIdx === 0);
                } else {
                    const target = stackPos[Math.max(0, cIdx) % stackPos.length];
                    moveToward(player, target, dt, false);
                }
            }

            player.update(dt, null);
        }
    }

    private updateDefense(
        dt: number,
        team: Team,
        opponentTeam: Team,
        disc: Disc,
        attackingEndzone: number,
        stallCount: number,
    ): void {
        const discPos = disc.position;
        const discHolder = opponentTeam.getHolder() || null;
        const availableDefenders = team.players.filter((p) => !p.isControlled);
        this.updateForceSide(dt, discPos, stallCount);

        if (this.defenseType === 'zone_331') {
            this.lastHelpDefenderIndex = null;
            if (
                this.zonePositions.size === 0 ||
                this.zonePositions.size !== availableDefenders.length ||
                this.reassignTimer > this.profile.reassignInterval
            ) {
                this.reassignTimer = 0;
                this.zonePositions = assignZone331Positions(
                    availableDefenders,
                    discPos,
                    attackingEndzone,
                );
            }

            const crashing = new Set<Player>();
            if (disc.state === 'in_flight') {
                const crashers = [...availableDefenders]
                    .sort(
                        (a, b) =>
                            a.movement.position.distanceToSquared(discPos) -
                            b.movement.position.distanceToSquared(discPos),
                    )
                    .slice(0, 2);
                for (const c of crashers) crashing.add(c);
            }

            for (const player of team.players) {
                if (player.isControlled) continue;
                if (crashing.has(player)) {
                    moveToward(player, discPos, dt, true);
                    player.update(dt, null);
                    continue;
                }

                const zoneTarget = this.zonePositions.get(player);
                if (zoneTarget) {
                    const adaptiveZoneTarget = this.getAdaptiveZoneTarget(
                        zoneTarget,
                        discPos,
                    );
                    moveToward(player, adaptiveZoneTarget, dt, false);
                }

                player.update(dt, null);
            }
            return;
        }

        if (
            this.matchups.size === 0 ||
            this.matchups.size !== availableDefenders.length ||
            this.reassignTimer > this.profile.reassignInterval
        ) {
            this.reassignTimer = 0;
            this.matchups = assignMatchups(availableDefenders, opponentTeam.players);
        }
        if (discHolder) {
            this.trySwitchMatchups(
                availableDefenders,
                opponentTeam.players,
                discHolder,
            );
        }
        const helpAssignments = this.buildRedZoneHelpAssignments(
            availableDefenders,
            opponentTeam.players,
            discPos,
            discHolder,
            attackingEndzone,
            stallCount,
        );

        for (const player of team.players) {
            if (player.isControlled) continue;

            const mark = this.matchups.get(player) || null;
            const isMarker = discHolder !== null && mark === discHolder;

            const helperTarget = helpAssignments.get(player);
            if (helperTarget && !isMarker) {
                moveToward(player, helperTarget, dt, true);
                player.update(dt, null);
                continue;
            }

            if (isMarker && discHolder) {
                updateMarkMirror(player, discHolder, dt);
            }

            const action = decideDefense(
                player,
                mark,
                discHolder,
                discPos,
                isMarker,
                stallCount,
                disc.state === 'in_flight',
                this.profile.poachChance *
                    (0.85 + this.tendency.defenseFlex * 0.5),
                this.forceSide,
            );

            if (action.type === 'move' && action.target) {
                moveToward(player, action.target, dt, action.sprint ?? false);
            }

            player.update(dt, null);
        }
    }

    private chooseActiveCutters(
        cutters: Player[],
        defenders: Player[],
        discPos: THREE.Vector3,
        attackingEndzone: number,
        stallCount: number,
        sidelinePressure: boolean,
        dt: number,
    ): Set<number> {
        const active = new Set<number>();
        if (cutters.length === 0) return active;

        const scored = cutters.map((cutter) => ({
            cutter,
            score: this.scoreCutterOpportunity(
                cutter,
                cutters,
                defenders,
                discPos,
                attackingEndzone,
                stallCount,
                sidelinePressure,
            ),
        }));

        const current = cutters.find((c) => c.index === this.activeCutterIdx) || null;
        if (current) {
            const currentTimer = this.cutTimers.get(current) || 0;
            const overusedPenalty = Math.max(
                0,
                currentTimer - this.profile.activeCutDuration,
            ) * 0.55;
            const stickyBonus = 0.24 - overusedPenalty;
            const currentEntry = scored.find((entry) => entry.cutter === current);
            if (currentEntry) currentEntry.score += stickyBonus;
        }

        scored.sort((a, b) => b.score - a.score);
        const primary = scored[0]?.cutter || cutters[0];
        this.activeCutterIdx = primary.index;
        active.add(primary.index);

        const tempoBonus =
            (this.tendency.tempo - 0.95) * 0.18 +
            (this.tendency.aggression - 0.5) * 0.08;
        const secondaryChance = Math.max(
            0.08,
            this.profile.secondaryCutChance + tempoBonus + this.personalityMods.deepBias * 0.08,
        );
        if (
            scored[1] &&
            (stallCount >= 4 || Random.next() < secondaryChance * dt * 4.5)
        ) {
            active.add(scored[1].cutter.index);
        }
        if (
            scored[2] &&
            (stallCount >= 8 ||
                (stallCount <= 3 &&
                    this.tendency.aggression > 0.64 &&
                    !sidelinePressure &&
                    Random.next() < 0.16 * dt * 6))
        ) {
            active.add(scored[2].cutter.index);
        }

        const deepThreat = scored.find(
            (entry) =>
                entry.cutter.role === 'deep_cutter' &&
                entry.score > scored[0].score - 0.25,
        );
        if (
            deepThreat &&
            stallCount <= 3 &&
            this.tendency.aggression + this.personalityMods.deepBias * 0.35 > 0.58 &&
            Random.next() <
                0.18 +
                    (this.tendency.aggression - 0.58) * 0.35 +
                    this.personalityMods.deepBias * 0.22
        ) {
            active.add(deepThreat.cutter.index);
        }

        return active;
    }

    private scoreCutterOpportunity(
        cutter: Player,
        cutters: Player[],
        defenders: Player[],
        discPos: THREE.Vector3,
        attackingEndzone: number,
        stallCount: number,
        sidelinePressure: boolean,
    ): number {
        const dir = attackingEndzone === 0 ? -1 : 1;
        let nearestDefDist = Infinity;
        for (const defender of defenders) {
            const dist = defender.movement.position.distanceTo(cutter.movement.position);
            if (dist < nearestDefDist) nearestDefDist = dist;
        }
        let nearestCutterDist = Infinity;
        for (const other of cutters) {
            if (other === cutter) continue;
            const d = other.movement.position.distanceTo(cutter.movement.position);
            if (d < nearestCutterDist) nearestCutterDist = d;
        }

        const depth = (cutter.movement.position.z - discPos.z) * dir;
        const lateralSpread = Math.abs(cutter.movement.position.x - discPos.x);
        const separationScore = Math.min(1.2, nearestDefDist / 4.5);
        const deepGain = THREE.MathUtils.clamp(depth / 18, -0.55, 1.15);
        const underReset = THREE.MathUtils.clamp((5 - Math.abs(depth)) / 6, -0.35, 0.9);
        const widthScore = THREE.MathUtils.clamp(
            lateralSpread / (FIELD_WIDTH * 0.5),
            0,
            1.0,
        );
        const crowdPenalty =
            nearestCutterDist < 3.6 ? (3.6 - nearestCutterDist) * 0.18 : 0;
        const sidelinePenalty =
            sidelinePressure &&
            Math.sign(cutter.movement.position.x || 1) ===
                Math.sign(discPos.x || 1)
                ? 0.22
                : 0;

        let roleBias = 0;
        if (cutter.role === 'deep_cutter') {
            roleBias += stallCount <= 4 ? 0.2 + this.tendency.aggression * 0.2 : -0.12;
        } else {
            roleBias += stallCount >= 6 ? 0.14 : 0;
        }

        const tempoNoise =
            (Random.next() - 0.5) *
            THREE.MathUtils.clamp(0.09 + (1.04 - this.tendency.tempo) * 0.06, 0.02, 0.14);
        const laneScore =
            stallCount >= 6
                ? underReset * (0.7 + this.personalityMods.resetBias * 0.35) +
                  deepGain * (0.18 + this.personalityMods.deepBias * 0.16)
                : deepGain *
                      (0.48 +
                          this.tendency.aggression * 0.18 +
                          this.personalityMods.deepBias * 0.24) +
                  underReset * (0.24 + this.personalityMods.resetBias * 0.2);

        return (
            separationScore * 0.45 +
            laneScore +
            widthScore * (0.12 + this.tendency.widthBias * 0.08) +
            roleBias +
            tempoNoise -
            crowdPenalty -
            sidelinePenalty
        );
    }

    private updateForceSide(
        dt: number,
        discPos: THREE.Vector3,
        stallCount: number,
    ): void {
        this.forceSwapTimer -= dt;
        const sidelineTrapEdge = FIELD_WIDTH * 0.33;
        if (discPos.x > sidelineTrapEdge) {
            this.forceSide = -1;
            this.forceSwapTimer = 1.2;
            return;
        }
        if (discPos.x < -sidelineTrapEdge) {
            this.forceSide = 1;
            this.forceSwapTimer = 1.2;
            return;
        }

        if (
            this.forceSwapTimer <= 0 &&
            stallCount < 6 &&
            Random.next() <
                THREE.MathUtils.clamp(
                    (0.28 + this.tendency.defenseFlex * 0.22) *
                        this.personalityMods.forceSwapRate,
                    0.05,
                    0.85,
                )
        ) {
            this.forceSide = this.forceSide === 1 ? -1 : 1;
            this.forceSwapTimer =
                1.6 + (1.2 - this.tendency.defenseFlex) * 0.9 + Random.next() * 1.7;
        }
    }

    private getAdaptiveZoneTarget(
        base: THREE.Vector3,
        discPos: THREE.Vector3,
    ): THREE.Vector3 {
        const depthFromDisc = Math.abs(base.z - discPos.z);
        const xWeight = depthFromDisc > 14 ? 0.24 : 0.4;
        const zWeight = depthFromDisc > 14 ? 0.08 : 0.2;
        return new THREE.Vector3(
            THREE.MathUtils.clamp(
                base.x * (1 - xWeight) +
                    discPos.x * xWeight * (0.86 + this.tendency.widthBias * 0.22),
                -FIELD_WIDTH * 0.47,
                FIELD_WIDTH * 0.47,
            ),
            0,
            base.z + THREE.MathUtils.clamp((discPos.z - base.z) * zWeight, -2.8, 2.8),
        );
    }

    private buildRedZoneHelpAssignments(
        defenders: Player[],
        offenders: Player[],
        discPos: THREE.Vector3,
        discHolder: Player | null,
        teamAttackingEndzone: number,
        stallCount: number,
    ): Map<Player, THREE.Vector3> {
        const assignments = new Map<Player, THREE.Vector3>();
        this.lastHelpDefenderIndex = null;
        if (!discHolder) return assignments;

        const opponentAttackingEndzone = teamAttackingEndzone === 0 ? 100 : 0;
        const distanceToGoal = Math.abs(opponentAttackingEndzone - discPos.z);
        if (distanceToGoal > 24) return assignments;

        const nonMarkerDefenders = defenders.filter(
            (defender) => this.matchups.get(defender) !== discHolder,
        );
        if (nonMarkerDefenders.length === 0) return assignments;

        let primaryHelper = nonMarkerDefenders[0];
        let primaryDepth = Math.abs(
            primaryHelper.movement.position.z - opponentAttackingEndzone,
        );
        for (const defender of nonMarkerDefenders.slice(1)) {
            const depth = Math.abs(
                defender.movement.position.z - opponentAttackingEndzone,
            );
            if (depth < primaryDepth) {
                primaryHelper = defender;
                primaryDepth = depth;
            }
        }

        const primaryGuard = this.makeHelpTarget(
            opponentAttackingEndzone,
            discPos,
            0,
        );
        assignments.set(primaryHelper, primaryGuard);
        this.lastHelpDefenderIndex = primaryHelper.index;

        const helpCollapseStall =
            this.personality === 'poach_chaos' ? 5 : 7;
        if (stallCount >= helpCollapseStall && nonMarkerDefenders.length > 1) {
            const secondaryHelper =
                nonMarkerDefenders.find((defender) => defender !== primaryHelper) ||
                null;
            if (secondaryHelper) {
                assignments.set(
                    secondaryHelper,
                    this.makeHelpTarget(opponentAttackingEndzone, discPos, 1),
                );
            }
        }

        if (
            this.personality === 'poach_chaos' &&
            distanceToGoal < 14 &&
            nonMarkerDefenders.length > 2
        ) {
            const freeHelper =
                nonMarkerDefenders.find(
                    (defender) => !assignments.has(defender),
                ) || null;
            if (freeHelper) {
                assignments.set(
                    freeHelper,
                    this.makeHelpTarget(opponentAttackingEndzone, discPos, 1),
                );
            }
        }

        if (this.tendency.aggression > 0.7 && distanceToGoal < 16) {
            let bestThreat: Player | null = null;
            let bestThreatDepth = -Infinity;
            const dir = opponentAttackingEndzone === 0 ? -1 : 1;
            for (const offender of offenders) {
                if (offender === discHolder) continue;
                const threatDepth = (offender.movement.position.z - discPos.z) * dir;
                if (threatDepth > bestThreatDepth) {
                    bestThreatDepth = threatDepth;
                    bestThreat = offender;
                }
            }
            const freeHelper =
                nonMarkerDefenders.find(
                    (defender) => !assignments.has(defender),
                ) || null;
            if (bestThreat && freeHelper) {
                assignments.set(
                    freeHelper,
                    bestThreat.movement.position.clone().setY(0),
                );
            }
        }

        return assignments;
    }

    private makeHelpTarget(
        opponentAttackingEndzone: number,
        discPos: THREE.Vector3,
        laneOffset: number,
    ): THREE.Vector3 {
        const centerBias = laneOffset === 0 ? 0.44 : 0.68;
        const lateral =
            laneOffset === 0
                ? discPos.x * centerBias
                : -discPos.x * centerBias * 0.8;
        const x = THREE.MathUtils.clamp(
            lateral,
            -FIELD_WIDTH * 0.4,
            FIELD_WIDTH * 0.4,
        );
        const z =
            opponentAttackingEndzone === 0
                ? THREE.MathUtils.clamp(discPos.z - (laneOffset === 0 ? 3.3 : 1.8), 2.5, 18)
                : THREE.MathUtils.clamp(
                      discPos.z + (laneOffset === 0 ? 3.3 : 1.8),
                      82,
                      97.5,
                  );
        return new THREE.Vector3(x, 0, z);
    }

    private getScriptedCutTarget(
        role: 'handler' | 'cutter',
        roleIndex: number,
        cutTimer: number,
        discPos: THREE.Vector3,
        attackingDir: number,
    ): { target: THREE.Vector3; sprint: boolean } | null {
        const roleCuts = this.scriptedCuts.filter(
            (cut) => cut.playerRole === role,
        );
        if (roleCuts.length === 0) return null;

        const timings = Array.from(
            new Set(roleCuts.map((cut) => cut.timing)),
        ).sort((a, b) => a - b);
        if (timings.length === 0) return null;

        const phaseLength =
            timings[timings.length - 1] +
            Math.max(1.6, this.profile.activeCutDuration * 0.75);
        const phase = phaseLength > 0 ? cutTimer % phaseLength : cutTimer;

        let selectedTiming = timings[0];
        for (const timing of timings) {
            if (phase >= timing) {
                selectedTiming = timing;
            } else {
                break;
            }
        }

        const options = roleCuts
            .filter((cut) => Math.abs(cut.timing - selectedTiming) < 0.0001)
            .sort((a, b) => b.priority - a.priority);
        const selected =
            options[Math.max(0, roleIndex) % Math.max(1, options.length)] ??
            roleCuts[0];
        const executing = phase >= selected.timing;
        const offsetX = executing ? selected.endX : selected.startX;
        const offsetZ = executing ? selected.endZ : selected.startZ;

        return {
            target: new THREE.Vector3(
                discPos.x + offsetX,
                0,
                discPos.z - attackingDir * offsetZ,
            ),
            sprint: executing,
        };
    }

    private trySwitchMatchups(
        defenders: Player[],
        offenders: Player[],
        discHolder: Player,
    ): void {
        for (const defender of defenders) {
            const current = this.matchups.get(defender);
            if (!current || current === discHolder) continue;

            const currentDist = defender.movement.position.distanceTo(
                current.movement.position,
            );
            if (currentDist < this.profile.switchDistance) continue;

            let best = current;
            let bestDist = currentDist;
            for (const offender of offenders) {
                if (offender === discHolder) continue;
                const d = defender.movement.position.distanceTo(
                    offender.movement.position,
                );
                if (d + 1.25 < bestDist) {
                    best = offender;
                    bestDist = d;
                }
            }

            if (best !== current) {
                this.matchups.set(defender, best);
            }
        }
    }

    private applyPersonalityToProfile(): void {
        this.profile = {
            ...this.baseProfile,
            decisionInterval: THREE.MathUtils.clamp(
                this.baseProfile.decisionInterval *
                    this.personalityMods.decisionIntervalMult,
                0.045,
                0.24,
            ),
            secondaryCutChance: THREE.MathUtils.clamp(
                this.baseProfile.secondaryCutChance *
                    this.personalityMods.secondaryCutMult,
                0.08,
                0.82,
            ),
            poachChance: THREE.MathUtils.clamp(
                this.baseProfile.poachChance * this.personalityMods.poachMult,
                0.04,
                0.5,
            ),
            switchDistance: THREE.MathUtils.clamp(
                this.baseProfile.switchDistance *
                    this.personalityMods.switchDistanceMult,
                5.5,
                12.0,
            ),
        };
    }

    private rollTendencyProfile(level: AIDifficulty): void {
        const sample = () => Random.next();
        const personalityVariance =
            this.personality === 'poach_chaos'
                ? 0.09
                : this.personality === 'huck_heavy'
                ? 0.06
                : 0.04;
        const variance =
            (level === 'hard' ? 0.26 : level === 'easy' ? 0.16 : 0.2) +
            personalityVariance;
        const baseAggression =
            (level === 'hard' ? 0.67 : level === 'easy' ? 0.38 : 0.53) +
            this.personalityMods.aggression;
        const baseTempo =
            (level === 'hard' ? 1.08 : level === 'easy' ? 0.9 : 1.0) +
            this.personalityMods.tempo;
        const baseWidth =
            (level === 'hard' ? 0.62 : level === 'easy' ? 0.45 : 0.54) +
            this.personalityMods.widthBias;
        const baseFlex =
            (level === 'hard' ? 0.66 : level === 'easy' ? 0.4 : 0.52) +
            this.personalityMods.defenseFlex;
        this.tendency = {
            aggression: THREE.MathUtils.clamp(
                baseAggression + (sample() - 0.5) * variance,
                0.22,
                0.9,
            ),
            tempo: THREE.MathUtils.clamp(
                baseTempo + (sample() - 0.5) * variance * 0.6,
                0.82,
                1.2,
            ),
            widthBias: THREE.MathUtils.clamp(
                baseWidth + (sample() - 0.5) * variance,
                0.2,
                0.88,
            ),
            defenseFlex: THREE.MathUtils.clamp(
                baseFlex + (sample() - 0.5) * variance,
                0.2,
                0.9,
            ),
        };
        this.forceSide = sample() < 0.5 ? -1 : 1;
        this.forceSwapTimer = 1.6 + sample() * 2.4;
    }

    private applyThrowVariance(throwParams: ThrowParams): ThrowParams {
        const direction = throwParams.direction.clone();
        direction.x += (Random.next() - 0.5) * this.profile.throwDirectionJitter;
        direction.y += (Random.next() - 0.5) * this.profile.throwDirectionJitter;
        direction.z += (Random.next() - 0.5) * this.profile.throwDirectionJitter;
        direction.normalize();

        const speedJitter =
            1 + (Random.next() - 0.5) * this.profile.throwSpeedJitter;

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
        this.lastActiveCutterIndices = [];
        this.lastHelpDefenderIndex = null;
        this.reassignTimer = this.profile.reassignInterval + 1;
        this.decisionTimer = 0;
        this.activeCutterIdx = 3;
        this.rollTendencyProfile(this.difficultyLevel);
    }
}
