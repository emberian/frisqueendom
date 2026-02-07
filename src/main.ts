import * as THREE from 'three';
import init, { DiscSimulator } from '../frisque-physics/pkg/frisque_physics.js';
import wasmUrl from '../frisque-physics/pkg/frisque_physics_bg.wasm?url';

import { createField } from './rendering/Field';
import { GameCamera } from './rendering/Camera';
import { DiscTrail } from './rendering/DiscTrail';
import { TrajectoryPreview } from './rendering/TrajectoryPreview';
import { GrassField } from './rendering/Grass';
import { ParticleSystem } from './rendering/Particles';
import { createSky } from './rendering/Sky';
import { PostFX } from './rendering/PostFX';
import { InputManager } from './InputManager';
import { Disc } from './entities/Disc';
import { Team } from './entities/Team';
import { Match } from './gameplay/Match';
import { ThrowController } from './gameplay/Throw';
import { checkCatch } from './gameplay/Catch';
import { PlayerSwitching } from './gameplay/PlayerSwitching';
import { TeamAI, type AIDifficulty } from './ai/TeamAI';
import { HUD } from './ui/HUD';
import { ThrowUI } from './ui/ThrowUI';
import { BroadcastPackage } from './ui/BroadcastPackage';
import {
    HalftimeOverlay,
    type HalftimeSummary,
} from './ui/HalftimeOverlay';
import {
    PostMatchOverlay,
    type MatchEventItem,
    type PerformerLine,
} from './ui/PostMatchOverlay';
import { AudioEngine } from './audio/AudioEngine';
import { MenuSystem } from './ui/Menus';
import { SpiritSystem } from './gameplay/Spirit';
import { CareerManager } from './management/Career';
import { saveManager } from './data/SaveLoad';
import { generateRoster } from './data/PlayerStats';
import {
    PHYSICS_DT,
    STALL_DURATION,
    TEAM_A_PRIMARY,
    TEAM_A_SECONDARY,
    TEAM_B_PRIMARY,
    TEAM_B_SECONDARY,
} from './data/Constants';
import type { TeamSide } from './data/Types';

type GameMode = 'menu' | 'practice' | 'quick_match' | 'career_match';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CAMERA_FORWARD = new THREE.Vector3();
const CAMERA_RIGHT = new THREE.Vector3();

function toAIDifficulty(value?: string): AIDifficulty {
    if (value === 'easy' || value === 'hard' || value === 'normal') {
        return value;
    }
    return 'normal';
}

function toCameraRelativeInput(
    inputDir: { x: number; z: number },
    camera: THREE.PerspectiveCamera,
): { x: number; z: number } {
    const inputMagSq = inputDir.x * inputDir.x + inputDir.z * inputDir.z;
    if (inputMagSq < 0.0001) {
        return { x: 0, z: 0 };
    }

    camera.getWorldDirection(CAMERA_FORWARD);
    CAMERA_FORWARD.y = 0;
    if (CAMERA_FORWARD.lengthSq() < 0.0001) {
        return inputDir;
    }
    CAMERA_FORWARD.normalize();
    CAMERA_RIGHT.crossVectors(WORLD_UP, CAMERA_FORWARD).normalize();

    const x = CAMERA_RIGHT.x * inputDir.x + CAMERA_FORWARD.x * inputDir.z;
    const z = CAMERA_RIGHT.z * inputDir.x + CAMERA_FORWARD.z * inputDir.z;
    return { x, z };
}

function disposeSceneResources(scene: THREE.Scene): void {
    scene.traverse((object) => {
        const mesh = object as {
            geometry?: THREE.BufferGeometry;
            material?: THREE.Material | THREE.Material[];
        };

        if (mesh.geometry) {
            mesh.geometry.dispose();
        }

        if (Array.isArray(mesh.material)) {
            for (const material of mesh.material) {
                material.dispose();
            }
        } else if (mesh.material) {
            mesh.material.dispose();
        }
    });
}

function toCssHex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
}

function formatClockLabel(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const mm = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const ss = (seconds % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
}

function prettyTurnoverReason(reason: string): string {
    switch (reason) {
        case 'stall':
            return 'Stall';
        case 'incomplete':
            return 'Incomplete';
        case 'out_of_bounds':
            return 'Out Of Bounds';
        case 'interception':
            return 'Interception';
        default:
            return reason.replace(/_/g, ' ');
    }
}

interface TeamLiveStats {
    turnovers: number;
    completions: number;
    attempts: number;
    longThrowMeters: number;
}

function completionPct(stats: TeamLiveStats): number {
    if (stats.attempts <= 0) return 0;
    return (stats.completions / stats.attempts) * 100;
}

function estimateThrowDistanceMeters(speed: number, directionY: number): number {
    const loftBoost = Math.max(-3, Math.min(9, directionY * 7));
    return Math.max(3, speed * 0.9 + loftBoost);
}

async function main() {
    await init({ module_or_path: wasmUrl });

    // Menu container
    const menuContainer = document.getElementById('menu-container')!;
    
    // Game state
    let currentMode: GameMode = 'menu';
    let isPaused = false;
    let gameLoopId: number | null = null;
    
    // Career manager
    let careerManager: CareerManager | null = null;
    
    // Spirit system
    const spiritSystem = new SpiritSystem();

    // Menu system
    const menuSystem = new MenuSystem(menuContainer, (state) => {
        if (state === 'none') {
            menuSystem.hide();
        } else {
            menuSystem.show();
        }
    });

    // Event listeners for menu actions
    window.addEventListener('startPractice', () => {
        currentMode = 'practice';
        startGame();
    });
    
    window.addEventListener('startQuickMatch', ((e: CustomEvent) => {
        currentMode = 'quick_match';
        startGame(e.detail);
    }) as EventListener);
    
    window.addEventListener('startCareerMatch', () => {
        currentMode = 'career_match';
        careerManager = CareerManager.load();
        startGame();
    });

    // Pause handler
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && currentMode !== 'menu') {
            togglePause();
        }
    });

    function togglePause(): void {
        isPaused = !isPaused;
        if (isPaused) {
            menuSystem.show();
            menuSystem.showPauseMenu(
                () => { isPaused = false; menuSystem.hide(); },
                () => { stopGame(); menuSystem.setState('main_menu'); }
            );
        } else {
            menuSystem.hide();
        }
    }

    // Main game instance
    let gameInstance: {
        cleanup: () => void;
    } | null = null;

    function stopGame(): void {
        if (gameLoopId !== null) {
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
        gameInstance?.cleanup();
        gameInstance = null;
        currentMode = 'menu';
        isPaused = false;
    }

    function startGame(matchConfig?: { color: string; difficulty: string; gameTo: number }): void {
        menuSystem.hide();
        
        // Create renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        document.body.appendChild(renderer.domElement);

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.FogExp2(0x87ceeb, 0.003);

        // Camera
        const gameCamera = new GameCamera();
        const camera = gameCamera.camera;

        // Lighting
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(30, 50, 20);
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0x404060, 0.8));

        // Environment
        createSky(scene);
        scene.add(createField());
        const grass = new GrassField(scene);

        // Teams setup
        let homeTeamColors = { primary: TEAM_A_PRIMARY, secondary: TEAM_A_SECONDARY };
        let awayTeamColors = { primary: TEAM_B_PRIMARY, secondary: TEAM_B_SECONDARY };
        
        if (matchConfig?.color === 'red') {
            homeTeamColors = { primary: TEAM_B_PRIMARY, secondary: TEAM_B_SECONDARY };
            awayTeamColors = { primary: TEAM_A_PRIMARY, secondary: TEAM_A_SECONDARY };
        }

        const homeTeamName =
            currentMode === 'career_match' && careerManager
                ? careerManager.data.teamName
                : 'Home';
        const awayTeamName = currentMode === 'career_match' ? 'Rivals' : 'Away';

        const homeTeam = Team.create(homeTeamName, homeTeamColors.primary, homeTeamColors.secondary, 'home', scene);
        const awayTeam = Team.create(awayTeamName, awayTeamColors.primary, awayTeamColors.secondary, 'away', scene);
        
        // Attach career stats to players if in career mode
        if (currentMode === 'career_match' && careerManager) {
            const lineup = careerManager.getStartingLineup();
            for (let i = 0; i < Math.min(7, lineup.length, homeTeam.players.length); i++) {
                homeTeam.players[i].setStats(lineup[i]);
            }
            // Generate random stats for AI team
            const aiRoster = generateRoster(7);
            for (let i = 0; i < Math.min(7, aiRoster.length, awayTeam.players.length); i++) {
                awayTeam.players[i].setStats(aiRoster[i]);
            }
        }
        
        const allPlayers = [...homeTeam.players, ...awayTeam.players];

        // Disc
        const discSim = new DiscSimulator();
        const windSpeed = 3.0;
        const windDir = 1.57;
        discSim.set_base_wind(windSpeed, windDir);
        const disc = new Disc(discSim, scene);

        // Visual effects
        const discTrail = new DiscTrail(scene);
        const trajectoryPreview = new TrajectoryPreview(scene);
        const particles = new ParticleSystem(scene);
        const postFX = new PostFX();

        // Audio
        const audio = new AudioEngine();
        let audioStarted = false;
        
        const startAudio = () => {
            if (!audioStarted) {
                audioStarted = true;
                audio.startAmbientWind(windSpeed);
                audio.startCrowdAmbience(0.22);
            }
        };
        window.addEventListener('click', startAudio, { once: true });
        window.addEventListener('keydown', startAudio, { once: true });

        // Input
        const input = new InputManager();
        const throwCtrl = new ThrowController();
        const switching = new PlayerSwitching();

        // AI
        const homeAI = new TeamAI();
        const awayAI = new TeamAI();
        const opponentDifficulty = currentMode === 'practice'
            ? 'easy'
            : toAIDifficulty(matchConfig?.difficulty);
        homeAI.setDifficulty('normal');
        awayAI.setDifficulty(opponentDifficulty);

        // Match
        const match = new Match();
        match.playerTeam = 'home';
        
        // Apply match config
        if (matchConfig?.gameTo) {
            match.setGameTo(matchConfig.gameTo);
        }

        // UI
        const hud = new HUD();
        const throwUI = new ThrowUI();
        const broadcast = new BroadcastPackage();
        const halftimeOverlay = new HalftimeOverlay();
        const postMatchOverlay = new PostMatchOverlay();
        hud.setTeams(
            homeTeam.name,
            awayTeam.name,
            toCssHex(homeTeam.primaryColor),
            toCssHex(awayTeam.primaryColor),
        );
        hud.updateScore(0, 0);
        hud.updateWind(windSpeed, windDir);
        broadcast.showMatchIntro(homeTeam, awayTeam, match.getGameTo());

        switching.switchTo(homeTeam.players[0]);

        // Debug
        (window as unknown as { __game?: object }).__game = {
            match,
            disc,
            homeTeam,
            awayTeam,
            input,
            discSim,
            spiritSystem,
        };

        // Game loop variables
        const followTarget = new THREE.Vector3(0, 0, 50);
        let physicsAccumulator = 0;
        let trailTimer = 0;
        let switchCooldown = 0;
        let prevScore = [0, 0];
        let prevOffenseTeam = match.offenseTeam;
        let prevPhase = match.phase;
        let matchEnded = false;
        let halftimeShown = false;
        let halftimePaused = false;
        const halftimeAtScore = Math.max(1, Math.ceil(match.getGameTo() / 2));
        const teamStats: Record<TeamSide, TeamLiveStats> = {
            home: {
                turnovers: 0,
                completions: 0,
                attempts: 0,
                longThrowMeters: 0,
            },
            away: {
                turnovers: 0,
                completions: 0,
                attempts: 0,
                longThrowMeters: 0,
            },
        };
        const momentumEvents: Array<{
            team: TeamSide;
            weight: number;
            timestamp: number;
        }> = [];
        const matchStartTime = performance.now();
        const performanceMap = new Map<
            string,
            { name: string; teamName: string; goals: number; blocks: number }
        >();
        const matchEvents: MatchEventItem[] = [];
        let lastTime = performance.now();

        function recordEvent(
            type: MatchEventItem['type'],
            text: string,
        ): void {
            matchEvents.push({
                timeLabel: formatClockLabel((performance.now() - matchStartTime) / 1000),
                type,
                text,
            });
        }

        function addGoal(playerId: string, playerName: string, teamName: string): void {
            const perf = performanceMap.get(playerId) ?? {
                name: playerName,
                teamName,
                goals: 0,
                blocks: 0,
            };
            perf.goals += 1;
            performanceMap.set(playerId, perf);
        }

        function addBlock(playerId: string, playerName: string, teamName: string): void {
            const perf = performanceMap.get(playerId) ?? {
                name: playerName,
                teamName,
                goals: 0,
                blocks: 0,
            };
            perf.blocks += 1;
            performanceMap.set(playerId, perf);
        }

        function registerThrowAttempt(team: TeamSide, estimatedDistance: number): void {
            teamStats[team].attempts += 1;
            teamStats[team].longThrowMeters = Math.max(
                teamStats[team].longThrowMeters,
                estimatedDistance,
            );
        }

        function registerMomentum(team: TeamSide, weight: number): void {
            momentumEvents.push({
                team,
                weight,
                timestamp: performance.now() - matchStartTime,
            });
            if (momentumEvents.length > 120) {
                momentumEvents.shift();
            }
        }

        function buildHalftimeSummary(): HalftimeSummary {
            let homeMomentum = 0;
            let awayMomentum = 0;
            for (const event of momentumEvents.slice(-12)) {
                if (event.team === 'home') {
                    homeMomentum += event.weight;
                } else {
                    awayMomentum += event.weight;
                }
            }
            const momentumDelta = homeMomentum - awayMomentum;
            const momentumValue = Math.max(-1, Math.min(1, momentumDelta / 6));
            const momentumLabel =
                Math.abs(momentumValue) < 0.18
                    ? 'Momentum is even heading into the second half.'
                    : momentumValue > 0
                    ? `${homeTeam.name} are pushing the pace.`
                    : `${awayTeam.name} are carrying the momentum.`;

            return {
                home: {
                    teamName: homeTeam.name,
                    turnovers: teamStats.home.turnovers,
                    completionPct: completionPct(teamStats.home),
                    longThrowMeters: teamStats.home.longThrowMeters,
                },
                away: {
                    teamName: awayTeam.name,
                    turnovers: teamStats.away.turnovers,
                    completionPct: completionPct(teamStats.away),
                    longThrowMeters: teamStats.away.longThrowMeters,
                },
                momentumLabel,
                momentumValue,
            };
        }

        function buildPerformerLines(): PerformerLine[] {
            return Array.from(performanceMap.values())
                .map((perf) => ({
                    name: perf.name,
                    teamName: perf.teamName,
                    goals: perf.goals,
                    blocks: perf.blocks,
                    impact: perf.goals * 3 + perf.blocks * 2,
                }))
                .sort((a, b) => b.impact - a.impact || b.goals - a.goals);
        }

        function loop(now: number) {
            gameLoopId = requestAnimationFrame(loop);
            
            if (isPaused) return;

            const rawDt = Math.min((now - lastTime) / 1000, 0.05);
            lastTime = now;
            const frameDt = rawDt * postFX.timeScale;

            if (halftimePaused) {
                const controlled = switching.controlledPlayer;
                if (disc.state === 'in_flight') {
                    followTarget.copy(disc.position);
                    gameCamera.setMode('follow_disc');
                } else if (controlled) {
                    followTarget.copy(controlled.movement.position);
                    gameCamera.setMode('follow_player');
                }
                gameCamera.update(frameDt, followTarget);
                postFX.update(rawDt, camera);
                renderer.render(scene, camera);
                return;
            }

            // Wind update
            discSim.update_wind(frameDt);
            broadcast.update(frameDt);

            // Match state
            match.update(frameDt, homeTeam, awayTeam, disc);
            hud.updatePhase(match.phase);
            hud.updateScore(match.score[0], match.score[1]);
            hud.showStateText(match.statusText, match.statusTextActive);

            const maxScore = Math.max(match.score[0], match.score[1]);
            const scoreDiff = Math.abs(match.score[0] - match.score[1]);
            const lateGamePressure =
                maxScore >= Math.max(1, match.getGameTo() - 2) ? 0.24 : 0;
            const closeGameBoost = scoreDiff <= 1 ? 0.18 : 0;
            const stallPressure = Math.min(match.point.stallCount / STALL_DURATION, 1) * 0.2;
            const flightEnergy =
                disc.state === 'in_flight'
                    ? Math.min(disc.velocity.length() / 30, 1) * 0.32
                    : 0;
            audio.updateCrowdExcitement(
                Math.min(1, 0.16 + lateGamePressure + closeGameBoost + stallPressure + flightEnergy),
            );

            if (
                match.phase !== prevPhase &&
                match.phase === 'pre_pull' &&
                match.pointsPlayed > 0
            ) {
                if (
                    !halftimeShown &&
                    maxScore >= halftimeAtScore &&
                    match.score[0] < match.getGameTo() &&
                    match.score[1] < match.getGameTo()
                ) {
                    halftimeShown = true;
                    halftimePaused = true;
                    throwCtrl.reset();
                    throwUI.hide();
                    trajectoryPreview.setVisible(false);
                    halftimeOverlay.show(buildHalftimeSummary(), () => {
                        halftimePaused = false;
                        broadcast.showKickoffCountdown(3, 'Second Half Pull');
                    });
                } else {
                    broadcast.showKickoffCountdown(
                        3,
                        `Point ${match.pointsPlayed + 1} Pull`,
                    );
                }
            }

            if (
                match.phase !== prevPhase &&
                match.phase === 'turnover_reset'
            ) {
                teamStats[prevOffenseTeam].turnovers += 1;
                registerMomentum(match.offenseTeam, 0.7);
                recordEvent(
                    'turnover',
                    `Turnover: ${prettyTurnoverReason(match.point.turnoverReason)}`,
                );
                audio.playCrowdCheer(0.35);
            }
            prevPhase = match.phase;

            if (match.offenseTeam !== prevOffenseTeam) {
                const myTeam = match.playerTeam === 'home' ? homeTeam : awayTeam;
                switching.switchToNearest(disc, myTeam);
                throwCtrl.reset();
                throwUI.hide();
                trajectoryPreview.setVisible(false);
            }
            prevOffenseTeam = match.offenseTeam;

            // Spirit system update
            spiritSystem.update(frameDt, match, allPlayers, disc);

            // Score celebration
            const homeScored = match.score[0] > prevScore[0];
            const awayScored = match.score[1] > prevScore[1];
            if (homeScored || awayScored) {
                const scoringTeam = homeScored ? 'home' : 'away';
                registerMomentum(scoringTeam, 1.25);
                prevScore = [...match.score];
                postFX.triggerScoreEffect();
                particles.emitScoreCelebration(disc.position);
                audio.playScoreJingle();
                audio.playCrowdCheer(1.0);
                homeAI.resetForPoint();
                awayAI.resetForPoint();

                const scorer = match.lastScorer;
                if (scorer) {
                    const scoringTeamName =
                        scorer.team === 'home' ? homeTeam.name : awayTeam.name;
                    addGoal(
                        scorer.playerId,
                        scorer.playerName,
                        scoringTeamName,
                    );
                    recordEvent(
                        'goal',
                        `${scorer.playerName} scores for ${scoringTeamName}`,
                    );
                } else {
                    recordEvent(
                        'goal',
                        `${scoringTeam === 'home' ? homeTeam.name : awayTeam.name} score`,
                    );
                }
                
                // Celebrate/score reactions
                for (const p of allPlayers) {
                    if (p.team === scoringTeam) {
                        p.celebrate();
                    } else {
                        p.frustrate();
                    }
                }
            }

            if (
                !matchEnded &&
                (match.score[0] >= match.getGameTo() || match.score[1] >= match.getGameTo())
            ) {
                matchEnded = true;
                audio.playCrowdCheer(1.0);
                const performerLines = buildPerformerLines();
                postMatchOverlay.show(
                    {
                        homeTeamName: homeTeam.name,
                        awayTeamName: awayTeam.name,
                        homeScore: match.score[0],
                        awayScore: match.score[1],
                        playerOfMatch:
                            performerLines.length > 0 ? performerLines[0] : null,
                        topPerformers: performerLines,
                        events: matchEvents,
                    },
                    () => {
                        stopGame();
                        menuSystem.setState('main_menu');
                    },
                );
            }

            if (matchEnded) {
                const controlled = switching.controlledPlayer;
                if (disc.state === 'in_flight') {
                    followTarget.copy(disc.position);
                    gameCamera.setMode('follow_disc');
                } else if (controlled) {
                    followTarget.copy(controlled.movement.position);
                    gameCamera.setMode('follow_player');
                }
                gameCamera.update(frameDt, followTarget);
                postFX.update(rawDt, camera);
                renderer.render(scene, camera);
                return;
            }

            // Handle phase logic
            const controlled = switching.controlledPlayer;
            const rawMovement = input.getMovementDir();
            const cameraRelativeMovement = toCameraRelativeInput(rawMovement, camera);
            hud.updateContext({
                phase: match.phase,
                hasDisc: !!controlled?.holdingDisc,
                isPlayerOnOffense: match.isPlayerOnOffense(),
                isPlayerPulling: match.isPlayerPulling(),
                quickReleaseAvailable: throwCtrl.isQuickRelease,
            });

            // Player switch
            switchCooldown = Math.max(0, switchCooldown - frameDt);
            if (input.isSwitchPlayer() && switchCooldown <= 0) {
                const myTeam = match.playerTeam === 'home' ? homeTeam : awayTeam;
                switching.switchToNext(myTeam);
                switchCooldown = 0.3;
            }

            // Pre-pull
            if (match.phase === 'pre_pull' && match.pullReady) {
                if (
                    !broadcast.isPullLocked() &&
                    (input.isJumping() || input.mouseButtons.left)
                ) {
                    match.executePull(disc, homeTeam, awayTeam);
                    audio.playThrowWhoosh(25);
                }
            }

            // Live play
            if (match.phase === 'live_play' && controlled) {
                if (controlled.holdingDisc) {
                    const throwParams = throwCtrl.update(frameDt, input, controlled, camera);

                    if (throwCtrl.charging) {
                        throwUI.show(throwCtrl.power, throwCtrl.hyzer, throwCtrl.forehand);

                        // Trajectory preview
                        if (saveManager.getSettings().gameplay.showTrajectory) {
                            discSim.throw_disc(
                                throwCtrl.power * (throwCtrl.forehand ? 28 : 25),
                                throwCtrl.direction.x,
                                throwCtrl.direction.y,
                                throwCtrl.direction.z,
                                (throwCtrl.forehand ? 100 : 80) * throwCtrl.power * 1.1,
                                0.05 - throwCtrl.power * 0.02,
                                throwCtrl.hyzer,
                                1.5,
                                0,
                                throwCtrl.forehand,
                            );
                            discSim.set_position(
                                controlled.movement.position.x,
                                1.5,
                                controlled.movement.position.z,
                            );
                            trajectoryPreview.update(disc.bridge);
                        }
                    } else {
                        throwUI.hide();
                        trajectoryPreview.setVisible(false);
                    }

                    if (throwParams) {
                        registerThrowAttempt(
                            match.playerTeam,
                            estimateThrowDistanceMeters(
                                throwParams.speed,
                                throwParams.direction.y,
                            ),
                        );
                        registerMomentum(match.playerTeam, 0.5);
                        disc.throwDisc(throwParams, match.playerTeam);
                        controlled.startThrow();
                        throwCtrl.reset();
                        throwUI.hide();
                        trajectoryPreview.setVisible(false);
                        audio.playThrowWhoosh(throwParams.speed);
                    }

                    controlled.update(frameDt, {
                        movementDir: rawMovement,
                        sprint: false,
                    });
                } else {
                    controlled.update(frameDt, {
                        movementDir: cameraRelativeMovement,
                        sprint: input.isSprinting(),
                    });
                }
            } else if (controlled && match.phase !== 'live_play') {
                controlled.update(frameDt, {
                    movementDir: controlled.holdingDisc
                        ? rawMovement
                        : cameraRelativeMovement,
                    sprint: input.isSprinting(),
                });
            }

            // AI updates
            const isHomeOffense = match.offenseTeam === 'home';

            if (match.phase === 'live_play' || match.phase === 'pulling') {
                const homeThrow = homeAI.update(
                    frameDt, homeTeam, awayTeam, disc, isHomeOffense,
                    match.attackingEndzone.home, match.point.stallCount,
                );
                const awayThrow = awayAI.update(
                    frameDt, awayTeam, homeTeam, disc, !isHomeOffense,
                    match.attackingEndzone.away, match.point.stallCount,
                );

                if (homeThrow && disc.state === 'held' && disc.holder?.team === 'home') {
                    registerThrowAttempt(
                        'home',
                        estimateThrowDistanceMeters(
                            homeThrow.speed,
                            homeThrow.direction.y,
                        ),
                    );
                    registerMomentum('home', 0.45);
                    disc.throwDisc(homeThrow, 'home');
                    homeTeam.players.find(p => p.holdingDisc)?.startThrow();
                    audio.playThrowWhoosh(homeThrow.speed);
                }
                if (awayThrow && disc.state === 'held' && disc.holder?.team === 'away') {
                    registerThrowAttempt(
                        'away',
                        estimateThrowDistanceMeters(
                            awayThrow.speed,
                            awayThrow.direction.y,
                        ),
                    );
                    registerMomentum('away', 0.45);
                    disc.throwDisc(awayThrow, 'away');
                    awayTeam.players.find(p => p.holdingDisc)?.startThrow();
                    audio.playThrowWhoosh(awayThrow.speed);
                }
            }

            // Update non-controlled players
            for (const p of allPlayers) {
                if (!p.isControlled && match.phase !== 'live_play' && match.phase !== 'pulling') {
                    p.update(frameDt, null);
                }
            }

            // Physics
            if (disc.state === 'in_flight') {
                physicsAccumulator += frameDt;
                while (physicsAccumulator >= PHYSICS_DT) {
                    disc.bridge.step(PHYSICS_DT);
                    physicsAccumulator -= PHYSICS_DT;
                    if (disc.bridge.isGrounded()) break;
                }
            }

            disc.update(frameDt);

            // Catch detection
            if (disc.state === 'in_flight' || disc.state === 'on_ground') {
                const wasInFlight = disc.state === 'in_flight';
                const thrownBy = disc.thrownByTeam;
                const result = checkCatch(disc, allPlayers, {
                    pickupTeam: match.offenseTeam,
                });
                if (result) {
                    disc.pickup(result.catcher);

                    if (wasInFlight && thrownBy && !result.isInterception) {
                        teamStats[thrownBy].completions += 1;
                        registerMomentum(thrownBy, 0.35);
                    }

                    if (result.isInterception) {
                        registerMomentum(result.catcher.team, 0.95);
                        const playerName =
                            result.catcher.stats?.fullName ??
                            `${result.catcher.role} #${result.catcher.index + 1}`;
                        const teamName =
                            result.catcher.team === 'home'
                                ? homeTeam.name
                                : awayTeam.name;
                        addBlock(result.catcher.id, playerName, teamName);
                        recordEvent('block', `${playerName} gets a block for ${teamName}`);
                        audio.playCrowdCheer(0.7);
                    }
                    
                    // Trigger continuation mode for quick release
                    if (result.catcher.isControlled) {
                        throwCtrl.onCatch();
                    }
                    
                    const myTeam = match.playerTeam === 'home' ? homeTeam : awayTeam;
                    if (saveManager.getSettings().gameplay.autoSwitchOnCatch) {
                        switching.autoSwitchOnCatch(result.catcher, myTeam);
                    }
                    audio.playCatchClap();
                    particles.emitCatchBurst(
                        disc.position,
                        result.catcher.team === 'home' ? TEAM_A_PRIMARY : TEAM_B_PRIMARY,
                    );
                    
                    // Layout catch effects
                    if (result.isLayout) {
                        postFX.triggerScoreEffect(); // Small screen shake
                    }
                }
            }

            // Stall HUD
            hud.updateStall(
                match.point.stallCount,
                STALL_DURATION,
                disc.state === 'held' && match.phase === 'live_play',
            );

            // Trail
            if (disc.state === 'in_flight') {
                trailTimer += frameDt;
                if (trailTimer > 0.016) {
                    discTrail.push(disc.position);
                    trailTimer = 0;
                }
            } else {
                discTrail.clear();
            }

            // Effects
            grass.update(frameDt, windSpeed, windDir);
            particles.update(frameDt);

            // Camera
            if (disc.state === 'in_flight') {
                followTarget.copy(disc.position);
                gameCamera.setMode('follow_disc');
            } else if (controlled) {
                followTarget.copy(controlled.movement.position);
                gameCamera.setMode('follow_player');
            }
            gameCamera.update(frameDt, followTarget);

            postFX.update(rawDt, camera);

            // Render
            renderer.render(scene, camera);
        }

        gameLoopId = requestAnimationFrame(loop);

        // Resize handler
        const resizeHandler = () => {
            gameCamera.handleResize();
            renderer.setSize(window.innerWidth, window.innerHeight);
            for (const p of allPlayers) {
                p.stickman.updateResolution(window.innerWidth, window.innerHeight);
            }
        };
        window.addEventListener('resize', resizeHandler);

        // Cleanup function
        gameInstance = {
            cleanup: () => {
                window.removeEventListener('resize', resizeHandler);
                window.removeEventListener('click', startAudio);
                window.removeEventListener('keydown', startAudio);
                input.destroy();
                audio.stopAmbientWind();
                audio.stopCrowdAmbience();
                disposeSceneResources(scene);
                renderer.dispose();
                if (renderer.domElement.parentNode === document.body) {
                    document.body.removeChild(renderer.domElement);
                }
                hud.destroy?.();
                throwUI.destroy?.();
                broadcast.destroy();
                halftimeOverlay.destroy();
                postMatchOverlay.destroy();
            }
        };
    }
}

main();
