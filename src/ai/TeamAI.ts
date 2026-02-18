import * as THREE from 'three';
import type { Player } from '../entities/Player';
import type { Team } from '../entities/Team';
import type { Disc } from '../entities/Disc';
import {
    computeStackPositions,
    computeHorizontalStackPositions,
    computeHandlerPositions,
    computeZoneOffensePositions,
    computeZoneOffenseHandlerPositions,
} from './Offense';
import { assignMatchups, assignZone331Positions, detectZoneDefense } from './Defense';
import type { OffenseFormation, DefenseFormation } from '../data/Types';
import {
    decideOffenseWithDisc,
    decideOffenseWithoutDisc,
    decideDefense,
    moveToward,
    findBestIntercept,
    getDifficultyScaling,
    getArchetypeProfile,
    setNearbyPlayersForAvoidance,
} from './PlayerAI';
import type { ReceiverEvaluation, DifficultyScaling } from './PlayerAI';
import type { ArchetypeProfile, AIArchetype } from '../data/GameplayConstants';
import { ARCHETYPE_PROFILES } from '../data/GameplayConstants';
import { updateMarkMirror } from './Marking';
import type { ThrowParams } from '../data/Types';
import type { DiscBridge } from '../physics/DiscBridge';
import { Random } from '../data/SeededRandom';
import type { Formation, Play } from '../data/SaveLoad';
import { FIELD_WIDTH, FIELD_LENGTH } from '../data/Constants';

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

export interface CutVisualization {
    playerIndex: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    isActive: boolean;
}

export interface DebugSnapshot {
    throwerIndex: number | null;
    throwerPos: THREE.Vector3 | null;
    receiverEvals: ReceiverEvaluation[];
    leadPassTarget: THREE.Vector3 | null;
    cutVisualizations: CutVisualization[];
    formationPositions: THREE.Vector3[];
    matchups: Array<{ defenderIndex: number; markIndex: number }>;
    forceSide: number;
    forceSideOrigin: THREE.Vector3 | null;
    helpDefenderIndex: number | null;
    personality: string;
    tendency: { aggression: number; tempo: number; widthBias: number; defenseFlex: number };
    isOnOffense: boolean;
    stallCount: number;
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
    debugEnabled = false;
    private _debugSnapshot: DebugSnapshot | null = null;
    private _lastDebugEvals: ReceiverEvaluation[] = [];
    private _lastDebugLeadTarget: THREE.Vector3 | null = null;

    // Handler repositioning timer (oscillates to create continuous movement)
    private handlerDriftTimer = 0;

    // --- Feature: isPlayerTeam flag for difficulty scaling ---
    private isPlayerTeam = false;
    // Difficulty scaling profiles (computed from difficulty + isPlayerTeam)
    private offenseScaling: DifficultyScaling = getDifficultyScaling('pro');
    private defenseScaling: DifficultyScaling = getDifficultyScaling('pro');

    // --- Feature: Zone offense detection ---
    private facingZoneDefense = false;
    private zoneDetectTimer = 0;

    // --- Feature: AI Personality Archetypes ---
    // Per-player archetype assignments (player index -> archetype)
    private playerArchetypes = new Map<number, AIArchetype>();
    // Cached archetype profiles
    private playerArchetypeProfiles = new Map<number, ArchetypeProfile>();
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
        throwDirectionJitter: 0.025,
        throwSpeedJitter: 0.04,
        secondaryCutChance: 0.35,
        poachChance: 0.16,
        switchDistance: 8.5,
    };

    setDifficulty(level: AIDifficulty): void {
        this.difficultyLevel = level;
        this.updateDifficultyScaling();
        if (level === 'easy') {
            this.baseProfile = {
                decisionInterval: 0.18,
                activeCutDuration: 3.4,
                reassignInterval: 2.5,
                throwDirectionJitter: 0.04,
                throwSpeedJitter: 0.06,
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
            throwDirectionJitter: 0.025,
            throwSpeedJitter: 0.04,
            secondaryCutChance: 0.35,
            poachChance: 0.16,
            switchDistance: 8.5,
        };
        this.applyPersonalityToProfile();
        this.rollTendencyProfile(level);
    }

    /**
     * Set whether this AI controls the player's team (true) or the opponent (false).
     * This determines difficulty scaling direction:
     * - Rookie: player team = smart AI teammates, opponent = dumb
     * - Legend: player team = mistake-prone teammates, opponent = elite
     */
    setIsPlayerTeam(isPlayer: boolean): void {
        this.isPlayerTeam = isPlayer;
        this.updateDifficultyScaling();
    }

    /**
     * Assign an archetype to a specific player by index.
     * Archetypes influence decision weights for that player.
     */
    setPlayerArchetype(playerIndex: number, archetype: AIArchetype): void {
        this.playerArchetypes.set(playerIndex, archetype);
        this.playerArchetypeProfiles.set(playerIndex, getArchetypeProfile(archetype));
    }

    /**
     * Get the archetype assigned to a player, if any.
     */
    getPlayerArchetype(playerIndex: number): AIArchetype | null {
        return this.playerArchetypes.get(playerIndex) ?? null;
    }

    /**
     * Auto-assign archetypes to all players based on their stats.
     * Maps stat profiles to the closest matching archetype.
     */
    autoAssignArchetypes(players: Player[]): void {
        for (const player of players) {
            if (player.isControlled) continue;
            const archetype = this.inferArchetype(player);
            this.setPlayerArchetype(player.index, archetype);
        }
    }

    private inferArchetype(player: Player): AIArchetype {
        if (!player.stats) return 'grinder';

        const speed = player.stats.getEffectiveStat('speed');
        const throwAcc = player.stats.getEffectiveStat('throwAccuracy');
        const awareness = player.stats.getEffectiveStat('awareness');
        const catching = player.stats.getEffectiveStat('catching');
        const marking = player.stats.getEffectiveStat('marking');

        // Simple heuristic mapping
        const physicalScore = speed + catching;
        const mentalScore = awareness + throwAcc;
        const defenseScore = marking + speed;
        const overall = (physicalScore + mentalScore + defenseScore) / 6;

        if (overall < 35) return 'rookie_player';
        if (awareness > 80 && throwAcc > 75 && marking > 60) return 'captain';
        if (speed > 80 && catching > 70 && awareness < 50) return 'athlete';
        if (throwAcc > 80 && awareness < 55) return 'gunslinger';
        if (awareness > 70 && marking > 65 && speed < 60) return 'veteran';
        if (awareness > 60 && marking > 55) return 'grinder';
        return 'grinder';
    }

    private updateDifficultyScaling(): void {
        if (this.difficultyLevel === 'easy') {
            // Rookie: player's AI teammates are smart, opponents are bad
            this.offenseScaling = getDifficultyScaling(
                this.isPlayerTeam ? 'rookie_teammate' : 'rookie_opponent');
            this.defenseScaling = getDifficultyScaling(
                this.isPlayerTeam ? 'rookie_teammate' : 'rookie_opponent');
        } else if (this.difficultyLevel === 'hard') {
            // Legend: player's AI teammates make mistakes, opponents are elite
            this.offenseScaling = getDifficultyScaling(
                this.isPlayerTeam ? 'legend_teammate' : 'legend_opponent');
            this.defenseScaling = getDifficultyScaling(
                this.isPlayerTeam ? 'legend_teammate' : 'legend_opponent');
        } else {
            // Pro: balanced
            this.offenseScaling = getDifficultyScaling('pro');
            this.defenseScaling = getDifficultyScaling('pro');
        }
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

    getDebugSnapshot(): DebugSnapshot | null {
        return this._debugSnapshot;
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

        // Set collision avoidance context for all players on this team
        setNearbyPlayersForAvoidance(team.players);

        // Advance handler drift timer for continuous repositioning
        this.handlerDriftTimer += dt;

        // --- Zone defense detection (check every 2 seconds) ---
        this.zoneDetectTimer += dt;
        if (this.zoneDetectTimer > 2.0) {
            this.zoneDetectTimer = 0;
            this.facingZoneDefense = detectZoneDefense(
                defenders, team.players, discPos);
        }

        // Determine effective formation: if facing zone defense, use zone offense
        const useZoneOffense = this.facingZoneDefense && !this.customFormation;
        const useHStack = !useZoneOffense &&
            this.formation === 'horizontal_stack' &&
            !(this.customFormation && this.customFormation.length > 0);

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
                : useZoneOffense
                ? computeZoneOffensePositions(discPos, attackingEndzone)
                : useHStack
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
                : useZoneOffense
                ? computeZoneOffenseHandlerPositions(discPos, attackingEndzone)
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

        // Disc on ground with no holder: send nearest non-controlled player to pick it up
        let pickupRunner: Player | null = null;
        if (disc.state === 'on_ground' && !disc.holder) {
            let bestDistSq = Infinity;
            for (const p of team.players) {
                if (p.isControlled) continue;
                const dSq = p.movement.position.distanceToSquared(discPos);
                if (dSq < bestDistSq) {
                    bestDistSq = dSq;
                    pickupRunner = p;
                }
            }
        }

        // When disc is in flight, extrapolate trajectory and find intercept targets
        const interceptTargets = new Map<Player, THREE.Vector3>();
        if (disc.state === 'in_flight') {
            const candidates: Array<{ player: Player; pos: THREE.Vector3; time: number }> = [];
            for (const p of team.players) {
                if (p.isControlled || p.holdingDisc) continue;
                const pos = findBestIntercept(p, disc.position, disc.velocity);
                if (pos) {
                    const dx = p.movement.position.x - pos.x;
                    const dz = p.movement.position.z - pos.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    const t = dist / Math.max(p.movement.sprintSpeed, 1);
                    candidates.push({ player: p, pos: pos.clone(), time: t });
                }
            }
            candidates.sort((a, b) => a.time - b.time);
            for (let i = 0; i < Math.min(2, candidates.length); i++) {
                interceptTargets.set(candidates[i].player, candidates[i].pos);
            }
        }

        const debugCuts: CutVisualization[] = [];
        let debugThrowerIndex: number | null = null;
        let debugThrowerPos: THREE.Vector3 | null = null;

        for (const player of team.players) {
            if (player.isControlled) continue;

            // If this player is assigned to pick up a ground disc, sprint to it
            if (player === pickupRunner) {
                moveToward(player, discPos, dt, true);
                player.update(dt, null);
                continue;
            }

            // If disc is in flight and this player has an intercept target, sprint to it
            if (interceptTargets.has(player)) {
                moveToward(player, interceptTargets.get(player)!, dt, true);
                player.update(dt, null);
                continue;
            }

            if (player.holdingDisc) {
                // Thrower should face the attacking direction
                const targetFacing = attackingEndzone === 0 ? Math.PI : 0;
                let facingDiff = targetFacing - player.movement.facing;
                while (facingDiff > Math.PI) facingDiff -= Math.PI * 2;
                while (facingDiff < -Math.PI) facingDiff += Math.PI * 2;
                player.movement.facing += facingDiff * Math.min(1, 6 * dt);

                debugThrowerIndex = player.index;
                debugThrowerPos = player.movement.position.clone();
                const decisionWindow =
                    this.profile.decisionInterval /
                    THREE.MathUtils.clamp(this.tendency.tempo, 0.82, 1.2);
                
                // STAGGERED: only check every N frames, and offset by player index
                const staggerFrame = (Math.floor(this.decisionTimer * 60) + player.index) % 6 === 0;
                
                // Apply archetype decision speed multiplier
                const archetypeProfile = this.playerArchetypeProfiles.get(player.index);
                const archetypeDecisionMult = archetypeProfile?.decisionSpeedMult ?? 1.0;
                const effectiveDecisionWindow = decisionWindow * archetypeDecisionMult;

                if (staggerFrame && this.decisionTimer > effectiveDecisionWindow) {
                    this.decisionTimer = 0;
                    const newEvals: ReceiverEvaluation[] = [];
                    const action = decideOffenseWithDisc(
                        player,
                        team.players,
                        defenders,
                        stallCount,
                        attackingEndzone,
                        windSpeed,
                        windDir,
                        this.debugEnabled ? newEvals : undefined,
                        this.offenseScaling,
                        archetypeProfile,
                    );
                    if (action.type === 'throw' && action.throwParams) {
                        const corrected = action.leadTarget
                            ? this.correctThrowAim(
                                  action.throwParams,
                                  action.leadTarget,
                                  disc.bridge,
                              )
                            : action.throwParams;
                        this.pendingThrow = this.applyThrowVariance(corrected);
                    }
                    if (this.debugEnabled) {
                        this._lastDebugEvals = newEvals;
                        this._lastDebugLeadTarget = action.leadTarget ?? null;
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

                // --- Active handler repositioning ---
                // Find the current thrower
                const thrower = team.players.find(p => p.holdingDisc) ?? null;
                const halfW = FIELD_WIDTH / 2;

                if (thrower && roleIndex >= 0) {
                    const throwerPos = thrower.movement.position;

                    if (roleIndex === 0) {
                        // DUMP HANDLER: Stay 5-8m behind the thrower, continuously
                        // shifting laterally to maintain an open dump lane.
                        // Oscillate laterally using the drift timer for "live" movement.
                        const dumpDepth = 6.5;
                        const dumpZ = throwerPos.z - dir * dumpDepth;
                        // Lateral drift: oscillate to stay open, period ~3s
                        const lateralDrift = Math.sin(this.handlerDriftTimer * 2.1) * 3.5;
                        // Bias toward the break side (opposite of disc's X from center)
                        const breakBias = -Math.sign(throwerPos.x || 1) * 1.5;
                        handlerTarget.x = THREE.MathUtils.clamp(
                            throwerPos.x + lateralDrift + breakBias,
                            -halfW * 0.44,
                            halfW * 0.44,
                        );
                        handlerTarget.z = Math.max(2, Math.min(FIELD_LENGTH - 2, dumpZ));
                    } else if (roleIndex === 1) {
                        // SWING HANDLER: Drift toward the break side to be available
                        // for break-side swing throws. Continuous gentle movement.
                        const swingDepth = 4.5;
                        const swingZ = throwerPos.z - dir * swingDepth;
                        // Break side: opposite of the force side, with gentle oscillation
                        const breakSideX = -Math.sign(throwerPos.x || 1) * halfW * 0.32;
                        const swingDrift = Math.sin(this.handlerDriftTimer * 1.7 + 1.2) * 2.0;
                        handlerTarget.x = THREE.MathUtils.clamp(
                            breakSideX + swingDrift,
                            -halfW * 0.44,
                            halfW * 0.44,
                        );
                        handlerTarget.z = Math.max(2, Math.min(FIELD_LENGTH - 2, swingZ));
                    }
                    // roleIndex === 2 (third handler) uses the static base position
                }

                if (sidelinePressure) {
                    const centerBias = -discPos.x * (0.42 + this.tendency.widthBias * 0.2);
                    handlerTarget.x = THREE.MathUtils.clamp(
                        handlerTarget.x * 0.45 + centerBias * 0.55,
                        -halfW * 0.45,
                        halfW * 0.45,
                    );
                    if (stallCount >= 5) {
                        handlerTarget.z -= dir * 2.5;
                    }
                }

                // --- Repulsion from nearby teammates for handler spacing ---
                for (const other of team.players) {
                    if (other === player || other.holdingDisc) continue;
                    const dx = handlerTarget.x - other.movement.position.x;
                    const dz = handlerTarget.z - other.movement.position.z;
                    const dSq = dx * dx + dz * dz;
                    const minSep = 3.5; // handlers shouldn't be closer than 3.5m
                    if (dSq < minSep * minSep && dSq > 0.01) {
                        const d = Math.sqrt(dSq);
                        const push = (minSep - d) * 0.5;
                        handlerTarget.x += (dx / d) * push;
                        handlerTarget.z += (dz / d) * push;
                    }
                }
                handlerTarget.x = THREE.MathUtils.clamp(handlerTarget.x, -halfW * 0.47, halfW * 0.47);
                handlerTarget.z = Math.max(2, Math.min(FIELD_LENGTH - 2, handlerTarget.z));

                moveToward(player, handlerTarget, dt, stallCount >= 8);
                player.update(dt, null);
                continue;
            }

            if (activeCutterIndices.has(player.index)) {
                // Horizontal stack: pass lane index for isolation cuts
                const hstackLane = useHStack
                    ? cutters.indexOf(player) % 4
                    : undefined;
                const cutterArchetype = this.playerArchetypeProfiles.get(player.index);
                const action = decideOffenseWithoutDisc(
                    player,
                    discPos,
                    true,
                    cutTimer,
                    attackingEndzone,
                    defenders,
                    hstackLane,
                    cutterArchetype,
                );
                if (action.type === 'move' && action.target) {
                    if (this.debugEnabled) {
                        debugCuts.push({
                            playerIndex: player.index,
                            from: player.movement.position.clone(),
                            to: action.target.clone(),
                            isActive: true,
                        });
                    }
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
                    const baseStackTarget = stackPos[Math.max(0, cIdx) % stackPos.length];
                    // Apply active repulsion from nearby teammates to prevent bunching
                    const repulsedTarget = new THREE.Vector3().copy(baseStackTarget);
                    for (const other of team.players) {
                        if (other === player || other.holdingDisc) continue;
                        const dx = repulsedTarget.x - other.movement.position.x;
                        const dz = repulsedTarget.z - other.movement.position.z;
                        const dSq = dx * dx + dz * dz;
                        const minSep = 4.0; // cutters should maintain 4m minimum separation
                        if (dSq < minSep * minSep && dSq > 0.01) {
                            const d = Math.sqrt(dSq);
                            const push = (minSep - d) * 0.4;
                            repulsedTarget.x += (dx / d) * push;
                            repulsedTarget.z += (dz / d) * push;
                        }
                    }
                    const halfW = FIELD_WIDTH / 2;
                    repulsedTarget.x = Math.max(-halfW * 0.47, Math.min(halfW * 0.47, repulsedTarget.x));
                    repulsedTarget.z = Math.max(2, Math.min(FIELD_LENGTH - 2, repulsedTarget.z));
                    moveToward(player, repulsedTarget, dt, false);
                }
            }

            player.update(dt, null);
        }

        if (this.debugEnabled) {
            const allFormation = [
                ...stackPos.map(p => p.clone()),
                ...handlerPos.map(p => p.clone()),
            ];
            this._debugSnapshot = {
                throwerIndex: debugThrowerIndex,
                throwerPos: debugThrowerPos,
                receiverEvals: this._lastDebugEvals,
                leadPassTarget: this._lastDebugLeadTarget,
                cutVisualizations: debugCuts,
                formationPositions: allFormation,
                matchups: [],
                forceSide: this.forceSide,
                forceSideOrigin: null,
                helpDefenderIndex: null,
                personality: this.personality,
                tendency: { ...this.tendency },
                isOnOffense: true,
                stallCount,
            };
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

        // Set collision avoidance context for all defenders
        setNearbyPlayersForAvoidance(team.players);

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
                Math.min(1, this.profile.poachChance *
                    (0.85 + this.tendency.defenseFlex * 0.5)),
                this.forceSide,
                this.defenseScaling,
                attackingEndzone,
            );

            if (action.type === 'move' && action.target) {
                moveToward(player, action.target, dt, action.sprint ?? false);
            }

            player.update(dt, null);
        }

        if (this.debugEnabled) {
            const matchupArr: Array<{ defenderIndex: number; markIndex: number }> = [];
            for (const [def, mark] of this.matchups) {
                matchupArr.push({ defenderIndex: def.index, markIndex: mark.index });
            }
            this._debugSnapshot = {
                throwerIndex: null,
                throwerPos: null,
                receiverEvals: [],
                leadPassTarget: null,
                cutVisualizations: [],
                formationPositions: [],
                matchups: matchupArr,
                forceSide: this.forceSide,
                forceSideOrigin: discHolder ? discHolder.movement.position.clone() : null,
                helpDefenderIndex: this.lastHelpDefenderIndex,
                personality: this.personality,
                tendency: { ...this.tendency },
                isOnOffense: false,
                stallCount,
            };
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

        // Penalize cutters that are already in their clearing phase
        for (const entry of scored) {
            const timer = this.cutTimers.get(entry.cutter) || 0;
            if (timer > 2.5) {
                entry.score -= 0.6;
            }
        }

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

        // --- Cut-and-clear overlap ---
        // When the primary cutter is approaching their clear threshold,
        // activate the next best cutter slightly early for smooth flow.
        // This creates the continuous cutting pattern seen in real ultimate.
        if (current) {
            const currentTimer = this.cutTimers.get(current) || 0;
            const clearThreshold = 2.5;
            const overlapWindow = 0.4; // start next cut 0.4s before current clears
            if (currentTimer > clearThreshold - overlapWindow && scored[1]) {
                // Next cutter should begin their approach
                active.add(scored[1].cutter.index);
            }
        }

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
        // Crowd penalty: players within 5m of each other are heavily penalized.
        // Quadratic falloff makes close bunching much more costly than distant players.
        const crowdThreshold = 5.0;
        let crowdPenalty = 0;
        for (const other of cutters) {
            if (other === cutter) continue;
            const d = other.movement.position.distanceTo(cutter.movement.position);
            if (d < crowdThreshold) {
                // Quadratic: being 1m apart = (4/5)^2 * 0.6 = 0.384 penalty per neighbor
                const ratio = (crowdThreshold - d) / crowdThreshold;
                crowdPenalty += ratio * ratio * 0.6;
            }
        }
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

    /**
     * Iterative throw solver using an aim-point approach.
     * Each iteration: predict trajectory, measure where the disc actually goes,
     * shift the aim point opposite to the error, recompute direction from scratch.
     * Direction is never rotated incrementally so it can't accumulate or diverge.
     */
    private correctThrowAim(
        params: ThrowParams,
        leadTarget: THREE.Vector3,
        bridge: DiscBridge,
    ): ThrowParams {
        const targetDist = params.position.distanceTo(leadTarget);
        if (targetDist < 3) return params;

        // Aim point starts at the lead target; each iteration shifts it
        // to compensate for where the disc actually ends up.
        let aimX = leadTarget.x;
        let aimZ = leadTarget.z;
        let curSpeed = params.speed;
        let curUpY = params.direction.y;
        let bestParams = params;
        let bestError = Infinity;

        for (let iter = 0; iter < 3; iter++) {
            // Build direction from throw position to current aim point
            const dx = aimX - params.position.x;
            const dz = aimZ - params.position.z;
            const hLen = Math.sqrt(dx * dx + dz * dz) || 1;
            const curDir = new THREE.Vector3(
                dx / hLen, curUpY, dz / hLen,
            ).normalize();

            const iterParams: ThrowParams = {
                ...params,
                speed: curSpeed,
                direction: curDir,
            };
            const traj = bridge.predictThrow(iterParams, 4.0, 40);
            if (traj.length < 6) break;

            // Find closest catchable approach to target (in XZ)
            let catchIdx = -1;
            let catchDistSq = Infinity;
            let anyIdx = 0;
            let anyDistSq = Infinity;
            for (let i = 0; i < traj.length; i += 3) {
                const ex = traj[i] - leadTarget.x;
                const ez = traj[i + 2] - leadTarget.z;
                const dSq = ex * ex + ez * ez;
                if (dSq < anyDistSq) { anyDistSq = dSq; anyIdx = i; }
                const y = traj[i + 1];
                if (y >= 0.3 && y <= 3.0 && dSq < catchDistSq) {
                    catchDistSq = dSq;
                    catchIdx = i;
                }
            }

            const useIdx = catchIdx >= 0 ? catchIdx : anyIdx;
            const errX = traj[useIdx] - leadTarget.x;
            const errZ = traj[useIdx + 2] - leadTarget.z;
            const errDist = Math.sqrt(errX * errX + errZ * errZ);

            if (errDist < bestError) {
                bestError = errDist;
                bestParams = iterParams;
            }
            if (catchIdx >= 0 && errDist < 1.5) break;

            // Shift aim point opposite to error (gain < 1 for stability)
            aimX -= errX * 0.7;
            aimZ -= errZ * 0.7;

            // Speed: along-track error check
            const ndx = dx / hLen;
            const ndz = dz / hLen;
            const alongErr = errX * ndx + errZ * ndz;
            if (alongErr > 2) {
                curSpeed *= 1 - Math.min(0.25, alongErr * 0.025);
            } else if (alongErr < -2) {
                curSpeed *= 1 + Math.min(0.2, -alongErr * 0.025);
            }
            curSpeed = THREE.MathUtils.clamp(curSpeed, 8, 28);

            // Height: if disc not at catchable height, adjust loft
            if (catchIdx < 0) {
                const y = traj[anyIdx + 1];
                if (y < 0.3) curUpY += 0.02;
                else if (y > 3.0) curUpY -= 0.015;
            }
        }

        // Safety: if best result diverged > 30° from original, use original
        if (bestParams !== params) {
            const dot =
                bestParams.direction.x * params.direction.x +
                bestParams.direction.z * params.direction.z;
            if (dot < 0.87) return params; // cos(30°) ≈ 0.866
        }

        return bestParams;
    }

    private applyThrowVariance(throwParams: ThrowParams): ThrowParams {
        const direction = throwParams.direction.clone();
        const jitter = this.profile.throwDirectionJitter;
        direction.x += (Random.next() - 0.5) * jitter;
        direction.y += (Random.next() - 0.5) * jitter * 0.3; // Much less Y jitter (prevents sailing/diving)
        direction.z += (Random.next() - 0.5) * jitter;
        direction.normalize();

        const speedJitter =
            1 + (Random.next() - 0.5) * this.profile.throwSpeedJitter;

        return {
            ...throwParams,
            direction,
            speed: Math.max(8, throwParams.speed * speedJitter),
        };
    }

    resetForPoint(): void {
        this.matchups.clear();
        this.zonePositions.clear();
        this.cutTimers.clear();
        this.lastActiveCutterIndices = [];
        this.lastHelpDefenderIndex = null;
        this._lastDebugEvals = [];
        this._lastDebugLeadTarget = null;
        this.reassignTimer = this.profile.reassignInterval + 1;
        this.decisionTimer = 0;
        this.activeCutterIdx = 3;
        this.facingZoneDefense = false;
        this.zoneDetectTimer = 0;
        this.handlerDriftTimer = 0;
        this.rollTendencyProfile(this.difficultyLevel);
    }
}
