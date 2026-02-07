import * as THREE from 'three';
import init, { DiscSimulator } from '../frisque-physics/pkg/frisque_physics.js';
import wasmUrl from '../frisque-physics/pkg/frisque_physics_bg.wasm?url';

import { createField } from './rendering/Field';
import { GameCamera } from './rendering/Camera';
import { DiscTrail } from './rendering/DiscTrail';
import { TrajectoryPreview } from './rendering/TrajectoryPreview';
import { GrassField } from './rendering/Grass';
import { ParticleSystem } from './rendering/Particles';
import { SkySystem } from './rendering/Sky';
import { PostFX } from './rendering/PostFX';
import {
    InputManager,
    type GameplayInputSource,
    type InputViewport,
} from './InputManager';
import { Disc } from './entities/Disc';
import { Team } from './entities/Team';
import type { Player } from './entities/Player';
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
import {
    SpectatorOverlay,
    type SpectatorView,
} from './ui/SpectatorOverlay';
import { AudioEngine } from './audio/AudioEngine';
import { CrowdAudio } from './audio/CrowdAudio';
import { MusicSystem } from './audio/MusicSystem';
import { VocalSynth } from './audio/VocalSynth';
import { GustSystem } from './gameplay/WindGust';
import { FieldFlags } from './rendering/FieldFlags';
import { Minimap } from './ui/Minimap';
import type { TimeOfDay, WeatherCondition } from './data/WeatherTypes';
import { WEATHER_EFFECTS } from './data/WeatherTypes';
import { TutorialSystem } from './ui/Tutorial';
import { ReplayRecorder, saveReplay } from './gameplay/Replay';
import { applyColorBlindPalette } from './ui/Accessibility';
import {
    MenuSystem,
    type MultiplayerMode,
    type QuickMatchConfig,
} from './ui/Menus';
import { SpiritSystem } from './gameplay/Spirit';
import { CareerManager } from './management/Career';
import { saveManager } from './data/SaveLoad';
import { generateRoster } from './data/PlayerStats';
import { NetworkInputProxy } from './network/NetworkInputProxy';
import { LanRelayClient } from './network/LanRelayClient';
import {
    PHYSICS_DT,
    STALL_DURATION,
    FIELD_WIDTH,
    FIELD_LENGTH,
    TEAM_A_PRIMARY,
    TEAM_A_SECONDARY,
    TEAM_B_PRIMARY,
    TEAM_B_SECONDARY,
} from './data/Constants';
import { THROW_CONFIGS } from './data/GameplayConstants';
import type { TeamSide } from './data/Types';

type GameMode =
    | 'menu'
    | 'practice'
    | 'quick_match'
    | 'career_match'
    | 'spectator_match';

const DEFAULT_LAN_RELAY_URL =
    window.location.hostname === 'localhost'
        ? 'ws://localhost:8787/ws'
        : `wss://${window.location.host}/ws`;

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
    CAMERA_RIGHT.crossVectors(CAMERA_FORWARD, WORLD_UP).normalize();

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

interface ControllerSlot {
    team: TeamSide;
    input: GameplayInputSource;
    switching: PlayerSwitching;
    throwCtrl: ThrowController;
    cameraRig: GameCamera;
    switchCooldown: number;
    viewport: InputViewport;
    active: boolean;
}

function makeViewport(
    x: number,
    y: number,
    width: number,
    height: number,
): InputViewport {
    return { x, y, width, height };
}

function setCameraViewportAspect(
    cameraRig: GameCamera,
    viewport: InputViewport,
): void {
    cameraRig.camera.aspect = viewport.width / Math.max(1, viewport.height);
    cameraRig.camera.updateProjectionMatrix();
}

function createLanStatusBadge(): HTMLDivElement {
    const badge = document.createElement('div');
    badge.style.cssText =
        'position:absolute;left:50%;top:14px;transform:translateX(-50%);' +
        'padding:6px 10px;border-radius:999px;z-index:120;' +
        'font-family:monospace;font-size:11px;letter-spacing:0.04em;' +
        'background:rgba(9,20,33,0.82);border:1px solid rgba(255,255,255,0.2);' +
        'color:#d5e9ff;display:none;pointer-events:none;';
    const ui = document.getElementById('ui');
    ui?.appendChild(badge);
    return badge;
}

// Browser test registration - run via window.__tests.discPhysics() in console
(window as any).__tests = {
    discPhysics: () => import('./tests/disc-physics.test').then(m => m.runAll()),
};

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

    window.addEventListener('startSpectatorMatch', ((e: CustomEvent) => {
        currentMode = 'spectator_match';
        startGame(e.detail);
    }) as EventListener);
    
    window.addEventListener('startCareerMatch', () => {
        currentMode = 'career_match';
        careerManager = CareerManager.load();
        startGame();
    });

    window.addEventListener('startTutorial', () => {
        currentMode = 'quick_match';
        startGame({ color: 'blue', difficulty: 'easy', gameTo: 3, multiplayerMode: 'single' }, true);
    });

    window.addEventListener('startPracticeDrill', ((e: CustomEvent) => {
        currentMode = 'practice';
        startGame(e.detail);
    }) as EventListener);

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

    function startGame(matchConfig?: QuickMatchConfig, tutorialMode?: boolean): void {
        menuSystem.hide();
        const isSpectator =
            currentMode === 'spectator_match' ||
            Boolean(matchConfig?.spectatorMode);
        const multiplayerMode: MultiplayerMode =
            currentMode === 'quick_match' && !isSpectator
                ? matchConfig?.multiplayerMode ?? 'single'
                : 'single';
        const splitScreenEnabled = multiplayerMode === 'local_split';
        const lanRemoteEnabled = multiplayerMode === 'lan_remote';
        
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
        const gameCameraP2 = splitScreenEnabled || lanRemoteEnabled ? new GameCamera() : null;

        // Lighting
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(30, 50, 20);
        scene.add(sun);
        const ambient = new THREE.AmbientLight(0x404060, 0.8);
        scene.add(ambient);

        // Environment
        const sky = new SkySystem(scene, sun, ambient);
        sky.applyPreset('midday'); // Default to midday
        scene.add(createField());
        const grass = new GrassField(scene);

        // Teams setup
        let homeTeamColors = { primary: TEAM_A_PRIMARY, secondary: TEAM_A_SECONDARY };
        let awayTeamColors = { primary: TEAM_B_PRIMARY, secondary: TEAM_B_SECONDARY };

        if (matchConfig?.color === 'red') {
            homeTeamColors = { primary: TEAM_B_PRIMARY, secondary: TEAM_B_SECONDARY };
            awayTeamColors = { primary: TEAM_A_PRIMARY, secondary: TEAM_A_SECONDARY };
        }

        // Apply color blind palette if configured
        const accessSettings = saveManager.getSettings().accessibility;
        if (accessSettings.colorBlindMode !== 'none') {
            const palette = applyColorBlindPalette(accessSettings.colorBlindMode);
            homeTeamColors = { primary: palette.teamA, secondary: palette.teamA };
            awayTeamColors = { primary: palette.teamB, secondary: palette.teamB };
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

        // Weather & environment
        const timeOfDay = (matchConfig?.timeOfDay ?? 'midday') as TimeOfDay;
        const weatherCondition = (matchConfig?.weather ?? 'clear') as WeatherCondition;
        const weatherEffects = WEATHER_EFFECTS[weatherCondition];
        sky.applyPreset(timeOfDay);

        // Wind gusts
        const gustSystem = new GustSystem();
        gustSystem.setIntensity(3);

        // Field flags
        const fieldFlags = new FieldFlags(scene);
        fieldFlags.setWind(windSpeed, windDir);

        // Minimap
        const minimap = new Minimap();
        if (isSpectator) minimap.setPosition('top-right');

        // Audio
        const audio = new AudioEngine();
        const audioCtx = audio.getContext();
        const crowdAudio = new CrowdAudio(audioCtx);
        const musicSystem = new MusicSystem(audioCtx);
        const vocalSynth = new VocalSynth(audioCtx);
        let audioStarted = false;

        const startAudio = () => {
            if (!audioStarted) {
                audioStarted = true;
                audio.startAmbientWind(windSpeed);
                crowdAudio.startAmbience(0.5);
                musicSystem.start();
            }
        };
        window.addEventListener('click', startAudio, { once: true });
        window.addEventListener('keydown', startAudio, { once: true });

        // Inputs and controllers
        const input = new InputManager({
            gamepadOrder: 0,
            allowTouch: !isSpectator,
        });
        const throwCtrl = new ThrowController();
        const switching = new PlayerSwitching();
        const inputP2Local = splitScreenEnabled
            ? new InputManager({
                  enableKeyboardMouse: false,
                  allowTouch: false,
                  gamepadOrder: 1,
              })
            : null;
        const inputP2Remote = lanRemoteEnabled ? new NetworkInputProxy() : null;
        const inputP2 = inputP2Local ?? inputP2Remote;
        const throwCtrlP2 = inputP2 ? new ThrowController() : null;
        const switchingP2 = inputP2 ? new PlayerSwitching() : null;
        const lanStatusBadge = createLanStatusBadge();
        let lanControllerConnected = !lanRemoteEnabled;
        const lanClient =
            lanRemoteEnabled && inputP2Remote
                ? new LanRelayClient({
                      url: matchConfig?.lanServerUrl || DEFAULT_LAN_RELAY_URL,
                      room: matchConfig?.lanRoom || 'fqd-room-1',
                      onControllerState: (state) => inputP2Remote.applyState(state),
                      onConnectionState: (connected, text) => {
                          lanControllerConnected = connected;
                          lanStatusBadge.textContent = text;
                          lanStatusBadge.style.display = 'block';
                          lanStatusBadge.style.borderColor = connected
                              ? 'rgba(57, 214, 125, 0.7)'
                              : 'rgba(255, 209, 102, 0.65)';
                      },
                  })
                : null;
        lanClient?.connect();

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

        let spectatorView: SpectatorView = 'auto';
        let spectatorSpeed = 1;
        let spectatorPaused = false;

        // UI
        const hud = new HUD();
        const throwUI = new ThrowUI();
        const broadcast = new BroadcastPackage();
        const halftimeOverlay = new HalftimeOverlay();
        const postMatchOverlay = new PostMatchOverlay();
        const spectatorOverlay = isSpectator
            ? new SpectatorOverlay({
                  onSetView: (view) => {
                      spectatorView = view;
                  },
                  onSpeedSet: (speed) => {
                      spectatorSpeed = Math.max(0.25, Math.min(2.5, speed));
                  },
                  onTogglePause: () => {
                      spectatorPaused = !spectatorPaused;
                  },
              })
            : null;
        hud.setTouchMode(isSpectator || input.isTouchControlsEnabled());
        hud.setTeams(
            homeTeam.name,
            awayTeam.name,
            toCssHex(homeTeam.primaryColor),
            toCssHex(awayTeam.primaryColor),
        );
        hud.updateScore(0, 0);
        hud.updateWind(windSpeed, windDir);
        broadcast.showMatchIntro(homeTeam, awayTeam, match.getGameTo());

        // Tutorial system
        const tutorial = tutorialMode
            ? new TutorialSystem(document.getElementById('ui')!, () => {
                  stopGame();
                  menuSystem.setState('main_menu');
              })
            : null;
        if (tutorial) {
            tutorial.start(1);
        }

        // Replay recorder
        const replayRecorder = new ReplayRecorder();
        replayRecorder.start(
            Math.floor(Math.random() * 2147483647),
            { home: homeTeam.name, away: awayTeam.name },
            { gameTo: match.getGameTo(), homeTeam: 'home', awayTeam: 'away' },
        );

        if (!isSpectator) {
            switching.switchTo(homeTeam.players[0]);
            switchingP2?.switchTo(awayTeam.players[0]);
        }

        // Debug
        (window as unknown as { __game?: object }).__game = {
            match,
            disc,
            homeTeam,
            awayTeam,
            input,
            inputP2,
            discSim,
            spiritSystem,
        };

        // Game loop variables
        const followTarget = new THREE.Vector3(0, 0, 50);
        const followTargetP2 = new THREE.Vector3(0, 0, 50);
        let physicsAccumulator = 0;
        let trailTimer = 0;
        let autoPullTimer = 0;
        let prevScore = [0, 0];
        let prevOffenseTeam = match.offenseTeam;
        let prevPhase = match.phase;
        let footstepAccum = 0;
        let prevStallCount = 0;
        const prevVelocityDir = new THREE.Vector3();
        let lastCutTime = 0;
        let minimapKeyLatch = false;
        let matchEnded = false;
        let halftimeShown = false;
        let halftimePaused = false;
        let pauseLatch = false;
        let spectatorHalftimeAutoTimer: number | null = null;
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
        const spectatorTarget = new THREE.Vector3(0, 0, 50);
        const spectatorKeyLatch: Record<string, boolean> = {};

        function keyJustPressed(code: string): boolean {
            const down = input.isKeyDown(code);
            const prev = spectatorKeyLatch[code] ?? false;
            spectatorKeyLatch[code] = down;
            return down && !prev;
        }

        function getTeamFocusPlayer(team: Team): Player {
            if (disc.holder && disc.holder.team === team.side) {
                return disc.holder;
            }
            let nearest = team.players[0];
            let nearestDist = Infinity;
            for (const p of team.players) {
                const d = p.movement.position.distanceTo(disc.position);
                if (d < nearestDist) {
                    nearest = p;
                    nearestDist = d;
                }
            }
            return nearest;
        }

        function resolveSpectatorView(): SpectatorView {
            if (spectatorView !== 'auto') {
                return spectatorView;
            }
            if (
                match.phase === 'pre_pull' ||
                match.phase === 'score' ||
                match.phase === 'point_reset' ||
                match.phase === 'turnover_reset'
            ) {
                return 'broadcast';
            }
            if (disc.state === 'in_flight') {
                return 'disc';
            }
            if (disc.holder?.team === 'home') {
                return 'home';
            }
            if (disc.holder?.team === 'away') {
                return 'away';
            }
            return 'broadcast';
        }

        function applySpectatorCamera(dt: number): void {
            switch (resolveSpectatorView()) {
                case 'broadcast':
                    spectatorTarget.set(0, 0, 50);
                    gameCamera.setMode('broadcast');
                    break;
                case 'disc':
                    if (disc.holder) {
                        spectatorTarget.copy(disc.holder.movement.position);
                    } else {
                        spectatorTarget.copy(disc.position);
                    }
                    gameCamera.setMode('follow_disc');
                    break;
                case 'home':
                    spectatorTarget.copy(getTeamFocusPlayer(homeTeam).movement.position);
                    gameCamera.setMode('follow_player');
                    break;
                case 'away':
                    spectatorTarget.copy(getTeamFocusPlayer(awayTeam).movement.position);
                    gameCamera.setMode('follow_player');
                    break;
            }
            gameCamera.update(dt, spectatorTarget);
        }

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

        const primarySlot: ControllerSlot = {
            team: 'home',
            input,
            switching,
            throwCtrl,
            cameraRig: gameCamera,
            switchCooldown: 0,
            viewport: makeViewport(0, 0, window.innerWidth, window.innerHeight),
            active: !isSpectator,
        };
        const secondarySlot: ControllerSlot | null =
            inputP2 && throwCtrlP2 && switchingP2 && gameCameraP2
                ? {
                      team: 'away',
                      input: inputP2,
                      switching: switchingP2,
                      throwCtrl: throwCtrlP2,
                      cameraRig: gameCameraP2,
                      switchCooldown: 0,
                      viewport: makeViewport(0, 0, window.innerWidth, window.innerHeight),
                      active: !lanRemoteEnabled || lanControllerConnected,
                  }
                : null;

        function updateViewports(): void {
            if (splitScreenEnabled && secondarySlot) {
                const halfWidth = Math.floor(window.innerWidth / 2);
                primarySlot.viewport = makeViewport(0, 0, halfWidth, window.innerHeight);
                secondarySlot.viewport = makeViewport(
                    halfWidth,
                    0,
                    window.innerWidth - halfWidth,
                    window.innerHeight,
                );
            } else {
                primarySlot.viewport = makeViewport(
                    0,
                    0,
                    window.innerWidth,
                    window.innerHeight,
                );
                if (secondarySlot) {
                    secondarySlot.viewport = makeViewport(
                        0,
                        0,
                        window.innerWidth,
                        window.innerHeight,
                    );
                }
            }
            setCameraViewportAspect(primarySlot.cameraRig, primarySlot.viewport);
            if (secondarySlot) {
                setCameraViewportAspect(secondarySlot.cameraRig, secondarySlot.viewport);
            }
        }

        updateViewports();

        function updateCameraForSlot(
            slot: ControllerSlot,
            dt: number,
            fallbackTarget: THREE.Vector3,
        ): void {
            const controlled = slot.switching.controlledPlayer;
            if (disc.state === 'in_flight') {
                if (slot === primarySlot) {
                    followTarget.copy(disc.position);
                    slot.cameraRig.setMode('follow_disc');
                    slot.cameraRig.update(dt, followTarget);
                } else {
                    followTargetP2.copy(disc.position);
                    slot.cameraRig.setMode('follow_disc');
                    slot.cameraRig.update(dt, followTargetP2);
                }
                return;
            }

            const target = controlled?.movement.position ?? fallbackTarget;
            if (slot === primarySlot) {
                followTarget.copy(target);
                slot.cameraRig.setMode('follow_player');
                slot.cameraRig.update(dt, followTarget);
            } else {
                followTargetP2.copy(target);
                slot.cameraRig.setMode('follow_player');
                slot.cameraRig.update(dt, followTargetP2);
            }
        }

        function renderFrame(rawDt: number, frameDt: number): void {
            if (isSpectator) {
                applySpectatorCamera(frameDt);
                postFX.update(rawDt, primarySlot.cameraRig.camera);
                renderer.setScissorTest(false);
                renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
                renderer.render(scene, primarySlot.cameraRig.camera);
                return;
            }

            const fallbackTarget = new THREE.Vector3(0, 0, 50);
            updateCameraForSlot(primarySlot, frameDt, fallbackTarget);
            if (secondarySlot && secondarySlot.active) {
                updateCameraForSlot(secondarySlot, frameDt, fallbackTarget);
            }

            postFX.update(rawDt, primarySlot.cameraRig.camera);
            if (!splitScreenEnabled || !secondarySlot || !secondarySlot.active) {
                renderer.setScissorTest(false);
                renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
                renderer.render(scene, primarySlot.cameraRig.camera);
                return;
            }

            renderer.setScissorTest(true);

            const left = primarySlot.viewport;
            renderer.setViewport(left.x, left.y, left.width, left.height);
            renderer.setScissor(left.x, left.y, left.width, left.height);
            renderer.render(scene, primarySlot.cameraRig.camera);

            const right = secondarySlot.viewport;
            renderer.setViewport(right.x, right.y, right.width, right.height);
            renderer.setScissor(right.x, right.y, right.width, right.height);
            renderer.render(scene, secondarySlot.cameraRig.camera);

            renderer.setScissorTest(false);
        }

        function loop(now: number) {
            gameLoopId = requestAnimationFrame(loop);

            const rawDt = Math.min((now - lastTime) / 1000, 0.05);
            lastTime = now;
            const spectatorScale = isSpectator
                ? spectatorPaused
                    ? 0
                    : spectatorSpeed
                : 1;
            const frameDt = rawDt * postFX.timeScale * spectatorScale;

            if (secondarySlot) {
                const shouldBeActive = !lanRemoteEnabled || lanControllerConnected;
                if (secondarySlot.active !== shouldBeActive) {
                    secondarySlot.active = shouldBeActive;
                    if (shouldBeActive) {
                        secondarySlot.switching.switchTo(awayTeam.players[0]);
                    } else {
                        secondarySlot.switching.clearControl();
                        secondarySlot.throwCtrl.reset();
                    }
                }
            }

            primarySlot.input.update(frameDt, primarySlot.viewport);
            if (secondarySlot) {
                secondarySlot.input.update(frameDt, secondarySlot.viewport);
            }

            const pausePressed =
                !isSpectator &&
                (primarySlot.input.isPausePressed() ||
                    (secondarySlot?.input.isPausePressed() ?? false));
            if (pausePressed && !pauseLatch) {
                togglePause();
            }
            pauseLatch = pausePressed;
            if (isPaused) return;

            if (isSpectator) {
                if (keyJustPressed('Digit1')) spectatorView = 'auto';
                if (keyJustPressed('Digit2')) spectatorView = 'broadcast';
                if (keyJustPressed('Digit3')) spectatorView = 'disc';
                if (keyJustPressed('Digit4')) spectatorView = 'home';
                if (keyJustPressed('Digit5')) spectatorView = 'away';
                if (keyJustPressed('BracketLeft')) {
                    spectatorSpeed = Math.max(0.25, spectatorSpeed - 0.25);
                }
                if (keyJustPressed('BracketRight')) {
                    spectatorSpeed = Math.min(2.5, spectatorSpeed + 0.25);
                }
                if (keyJustPressed('Digit0')) {
                    spectatorSpeed = 1;
                }
                if (keyJustPressed('Space') || keyJustPressed('KeyP')) {
                    spectatorPaused = !spectatorPaused;
                }
                spectatorOverlay?.setState(
                    spectatorView,
                    spectatorSpeed,
                    spectatorPaused || halftimePaused,
                    resolveSpectatorView(),
                    match.phase,
                    match.offenseTeam,
                );
            }

            if (isSpectator && spectatorPaused) {
                renderFrame(rawDt, frameDt);
                return;
            }

            if (halftimePaused) {
                renderFrame(rawDt, frameDt);
                return;
            }

            // Wind + gust update
            gustSystem.update(frameDt, FIELD_WIDTH, FIELD_LENGTH);
            const gust = gustSystem.sample(disc.position.x, disc.position.z);
            const baseWindX = Math.sin(windDir) * windSpeed;
            const baseWindZ = Math.cos(windDir) * windSpeed;
            const totalWindX = baseWindX + gust.dx;
            const totalWindZ = baseWindZ + gust.dz;
            const effectiveWindSpeed = Math.sqrt(totalWindX * totalWindX + totalWindZ * totalWindZ);
            const effectiveWindDir = Math.atan2(totalWindX, totalWindZ);
            discSim.set_base_wind(effectiveWindSpeed, effectiveWindDir);
            discSim.update_wind(frameDt);
            fieldFlags.setWind(effectiveWindSpeed, effectiveWindDir);
            fieldFlags.update(frameDt);
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
            const excitement = Math.min(1, 0.16 + lateGamePressure + closeGameBoost + stallPressure + flightEnergy);
            audio.updateCrowdExcitement(excitement);
            crowdAudio.setMomentum(excitement);
            crowdAudio.update(frameDt);
            musicSystem.setGameState({
                phase: match.phase,
                stallCount: match.point.stallCount,
                momentum: excitement,
                isCloseGame: scoreDiff <= 1 && maxScore >= 3,
            });
            musicSystem.update(frameDt);

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
                    secondarySlot?.throwCtrl.reset();
                    throwUI.hide();
                    trajectoryPreview.setVisible(false);
                    const continueFromHalftime = () => {
                        if (!halftimePaused) return;
                        halftimePaused = false;
                        if (spectatorHalftimeAutoTimer !== null) {
                            window.clearTimeout(spectatorHalftimeAutoTimer);
                            spectatorHalftimeAutoTimer = null;
                        }
                        broadcast.showKickoffCountdown(3, 'Second Half Pull');
                    };
                    vocalSynth.announceEndOfHalf();
                    vocalSynth.blowWhistle('long');
                    halftimeOverlay.show(buildHalftimeSummary(), continueFromHalftime);
                    if (isSpectator) {
                        if (spectatorHalftimeAutoTimer !== null) {
                            window.clearTimeout(spectatorHalftimeAutoTimer);
                        }
                        spectatorHalftimeAutoTimer = window.setTimeout(() => {
                            halftimeOverlay.hide();
                            continueFromHalftime();
                        }, 2200);
                    }
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
                replayRecorder.recordTurnover(
                    match.point.turnoverReason,
                    { x: disc.position.x, y: disc.position.y, z: disc.position.z },
                );
                crowdAudio.reactToNearMiss();
                vocalSynth.announceTurnover();
                vocalSynth.blowWhistle('short');
                postFX.triggerBlockShake();
                audio.stopDiscHum();
            }
            if (match.phase !== prevPhase) {
                replayRecorder.recordPhaseChange(prevPhase, match.phase, [...match.score] as [number, number]);
            }
            prevPhase = match.phase;

            if (match.offenseTeam !== prevOffenseTeam) {
                if (!isSpectator) {
                    const myTeam = homeTeam;
                    switching.switchToNearest(disc, myTeam);
                }
                throwCtrl.reset();
                if (secondarySlot && secondarySlot.active) {
                    if (!isSpectator) {
                        const p2Team =
                            secondarySlot.team === 'home' ? homeTeam : awayTeam;
                        secondarySlot.switching.switchToNearest(disc, p2Team);
                    }
                    secondarySlot.throwCtrl.reset();
                }
                throwUI.hide();
                trajectoryPreview.setVisible(false);
            }
            prevOffenseTeam = match.offenseTeam;

            // Spirit system update
            spiritSystem.update(frameDt, match, allPlayers, disc);
            hud.updateSpirit(spiritSystem.getPlayerTeamSpirit().total);

            // Player foul calling
            if (primarySlot.switching.controlledPlayer && primarySlot.input.isCallingFoul()) {
                const caller = primarySlot.switching.controlledPlayer;
                const opponentTeam = primarySlot.team === 'home' ? awayTeam : homeTeam;
                let nearestOpp: Player | null = null;
                let nearestDist = Infinity;
                for (const opp of opponentTeam.players) {
                    const d = opp.movement.position.distanceTo(caller.movement.position);
                    if (d < nearestDist) { nearestDist = d; nearestOpp = opp; }
                }
                spiritSystem.playerCallFoul(caller, nearestOpp);
            }

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
                audio.stopDiscHum();
                setTimeout(() => audio.playDiscSpike(), 300);
                setTimeout(() => audio.playTeamCheer(), 500);
                crowdAudio.reactToScore();
                vocalSynth.announceScore();
                homeAI.resetForPoint();
                awayAI.resetForPoint();

                const scorer = match.lastScorer;
                if (scorer) {
                    replayRecorder.recordScore(
                        scorer.playerId,
                        scorer.team as TeamSide,
                        [...match.score] as [number, number],
                    );
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
                crowdAudio.reactToScore();
                vocalSynth.announceGameOver();
                vocalSynth.blowWhistle('triple');
                musicSystem.stop();
                replayRecorder.stop();
                try { saveReplay(replayRecorder.getData()); } catch (_) { /* storage full */ }
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
                renderFrame(rawDt, frameDt);
                return;
            }

            // Handle phase logic
            const controlled = primarySlot.switching.controlledPlayer;
            const rawMovement = primarySlot.input.getMovementDir();
            const cameraRelativeMovement = toCameraRelativeInput(
                rawMovement,
                primarySlot.cameraRig.camera,
            );
            hud.updateContext({
                phase: match.phase,
                hasDisc: !!controlled?.holdingDisc,
                isPlayerOnOffense: match.isTeamOnOffense(primarySlot.team),
                isPlayerPulling: match.isTeamPulling(primarySlot.team),
                quickReleaseAvailable: primarySlot.throwCtrl.isQuickRelease,
            });

            // Player switch
            primarySlot.switchCooldown = Math.max(
                0,
                primarySlot.switchCooldown - frameDt,
            );
            if (
                primarySlot.input.isSwitchPlayer() &&
                primarySlot.switchCooldown <= 0
            ) {
                primarySlot.switching.switchToNext(homeTeam);
                primarySlot.switchCooldown = 0.3;
            }
            if (secondarySlot && secondarySlot.active) {
                secondarySlot.switchCooldown = Math.max(
                    0,
                    secondarySlot.switchCooldown - frameDt,
                );
                if (
                    secondarySlot.input.isSwitchPlayer() &&
                    secondarySlot.switchCooldown <= 0
                ) {
                    const secondTeam =
                        secondarySlot.team === 'home' ? homeTeam : awayTeam;
                    secondarySlot.switching.switchToNext(secondTeam);
                    secondarySlot.switchCooldown = 0.3;
                }
            }

            // Pre-pull
            if (match.phase === 'pre_pull' && match.pullReady) {
                let pullRequested = false;
                const pullingTeamHasHuman =
                    (match.pullingTeam === primarySlot.team && primarySlot.active) ||
                    (secondarySlot !== null &&
                        secondarySlot.active &&
                        match.pullingTeam === secondarySlot.team);
                if (
                    !isSpectator &&
                    match.pullingTeam === primarySlot.team &&
                    (primarySlot.input.isJumping() ||
                        primarySlot.input.mouseButtons.left)
                ) {
                    pullRequested = true;
                }
                if (
                    !isSpectator &&
                    !pullRequested &&
                    secondarySlot &&
                    secondarySlot.active &&
                    match.pullingTeam === secondarySlot.team &&
                    (secondarySlot.input.isJumping() ||
                        secondarySlot.input.mouseButtons.left)
                ) {
                    pullRequested = true;
                }
                if (
                    !broadcast.isPullLocked() &&
                    pullRequested
                ) {
                    match.executePull(disc, homeTeam, awayTeam);
                    audio.playThrowWhoosh(25);
                }
                if (!pullingTeamHasHuman) {
                    autoPullTimer += frameDt;
                    if (!broadcast.isPullLocked() && autoPullTimer > 1) {
                        autoPullTimer = 0;
                        match.executePull(disc, homeTeam, awayTeam);
                        audio.playThrowWhoosh(25);
                    }
                } else {
                    autoPullTimer = 0;
                }
            } else {
                autoPullTimer = 0;
            }

            // Live play
            let primaryUiVisible = false;
            const updateControlledSlot = (
                slot: ControllerSlot,
                showUi: boolean,
            ): void => {
                if (!slot.active) return;
                const controlledPlayer = slot.switching.controlledPlayer;
                if (!controlledPlayer) return;
                const rawMove = slot.input.getMovementDir();
                const cameraMove = toCameraRelativeInput(
                    rawMove,
                    slot.cameraRig.camera,
                );

                if (match.phase === 'live_play') {
                    if (controlledPlayer.holdingDisc) {
                        const throwParams = slot.throwCtrl.update(
                            frameDt,
                            slot.input,
                            controlledPlayer,
                            slot.cameraRig.camera,
                            slot.viewport,
                        );

                        if (showUi && slot.throwCtrl.charging) {
                            primaryUiVisible = true;
                            throwUI.show(
                                slot.throwCtrl.power,
                                slot.throwCtrl.hyzer,
                                slot.throwCtrl.forehand,
                            );

                            if (saveManager.getSettings().gameplay.showTrajectory) {
                                const previewConfig = THROW_CONFIGS[slot.throwCtrl.currentThrowType];
                                const previewPower = slot.throwCtrl.power;
                                discSim.throw_disc(
                                    previewPower * previewConfig.baseSpeed,
                                    slot.throwCtrl.direction.x,
                                    slot.throwCtrl.direction.y,
                                    slot.throwCtrl.direction.z,
                                    previewConfig.spinRate * previewPower * 1.1,
                                    previewConfig.noseAngle + (0.05 - previewPower * 0.09),
                                    slot.throwCtrl.hyzer + previewConfig.hyzerDefault,
                                    1.5,
                                    previewConfig.offAxis,
                                    slot.throwCtrl.forehand,
                                );
                                discSim.set_position(
                                    controlledPlayer.movement.position.x,
                                    1.5,
                                    controlledPlayer.movement.position.z,
                                );
                                trajectoryPreview.update(disc.bridge);
                            }
                        }

                        if (throwParams) {
                            registerThrowAttempt(
                                controlledPlayer.team,
                                estimateThrowDistanceMeters(
                                    throwParams.speed,
                                    throwParams.direction.y,
                                ),
                            );
                            registerMomentum(controlledPlayer.team, 0.5);
                            disc.throwDisc(throwParams, controlledPlayer.team);
                            audio.startDiscHum();
                            discTrail.setTeamColor(
                                controlledPlayer.team === 'home' ? TEAM_A_PRIMARY : TEAM_B_PRIMARY,
                            );
                            controlledPlayer.startThrow(slot.throwCtrl.currentThrowType);
                            slot.throwCtrl.reset();
                            if (showUi) {
                                throwUI.hide();
                                trajectoryPreview.setVisible(false);
                            }
                            audio.playThrowSound(throwParams.speed, slot.throwCtrl.currentThrowType);
                            replayRecorder.recordThrow(
                                controlledPlayer.id,
                                controlledPlayer.team,
                                throwParams,
                            );
                            tutorial?.checkCondition('disc_thrown');
                        }

                        controlledPlayer.update(frameDt, {
                            movementDir: rawMove,
                            sprint: false,
                        });
                        return;
                    }

                    controlledPlayer.update(frameDt, {
                        movementDir: cameraMove,
                        sprint: slot.input.isSprinting(),
                    });
                    return;
                }

                controlledPlayer.update(frameDt, {
                    movementDir: controlledPlayer.holdingDisc ? rawMove : cameraMove,
                    sprint: slot.input.isSprinting(),
                });
            };

            updateControlledSlot(primarySlot, true);
            if (secondarySlot) {
                updateControlledSlot(secondarySlot, false);
            }

            // Tutorial condition checks
            if (tutorial?.isActive()) {
                const rawMove = primarySlot.input.getMovementDir();
                if (Math.abs(rawMove.x) > 0.1 || Math.abs(rawMove.z) > 0.1) {
                    tutorial.checkCondition('player_moved');
                }
                if (primarySlot.input.isSprinting() && (Math.abs(rawMove.x) > 0.1 || Math.abs(rawMove.z) > 0.1)) {
                    tutorial.checkCondition('player_sprinted');
                }
                if (primarySlot.throwCtrl.charging) {
                    tutorial.checkCondition('throw_charged');
                }
                if (controlled?.holdingDisc) {
                    tutorial.checkCondition('disc_picked_up');
                }
                if (homeScored || awayScored) {
                    tutorial.checkCondition('scored_point');
                    tutorial.checkCondition('tutorial_completed');
                }
            }

            // Cut skid detection (controlled player sharp direction change)
            if (controlled) {
                const vel = controlled.movement.velocity;
                const speed = vel.length();
                if (speed > 4) {
                    const currentDir = vel.clone().normalize();
                    const dot = prevVelocityDir.dot(currentDir);
                    const now = performance.now() / 1000;
                    if (dot < -0.3 && now - lastCutTime > 0.3) {
                        audio.playCutSkid(1 - dot);
                        particles.emitGrassSpray(controlled.movement.position);
                        lastCutTime = now;
                    }
                    prevVelocityDir.copy(currentDir);
                } else if (speed > 0.5) {
                    prevVelocityDir.copy(vel).normalize();
                }
            }

            if (!primaryUiVisible) {
                throwUI.hide();
                trajectoryPreview.setVisible(false);
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
                    audio.startDiscHum();
                    discTrail.setTeamColor(TEAM_A_PRIMARY);
                    homeTeam.players.find(p => p.holdingDisc)?.startThrow(homeThrow.isForehand ? 'forehand' : 'backhand');
                    audio.playThrowSound(homeThrow.speed, homeThrow.isForehand ? 'forehand' : 'backhand');
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
                    audio.startDiscHum();
                    discTrail.setTeamColor(TEAM_B_PRIMARY);
                    awayTeam.players.find(p => p.holdingDisc)?.startThrow(awayThrow.isForehand ? 'forehand' : 'backhand');
                    audio.playThrowSound(awayThrow.speed, awayThrow.isForehand ? 'forehand' : 'backhand');
                }
            }

            // Update marking animation state
            if (disc.state === 'held' && disc.holder && match.phase === 'live_play') {
                const holder = disc.holder;
                const defenseTeam = holder.team === 'home' ? awayTeam : homeTeam;
                let closestDef: Player | null = null;
                let closestDist = 3.0; // Max marking distance
                for (const def of defenseTeam.players) {
                    const d = def.distanceTo(holder.movement.position);
                    if (d < closestDist) {
                        closestDist = d;
                        closestDef = def;
                    }
                }
                for (const p of allPlayers) {
                    if (p === closestDef) {
                        p.setMarking(true, match.point.stallCount / STALL_DURATION);
                    } else {
                        p.setMarking(false, 0);
                    }
                }
            } else {
                for (const p of allPlayers) {
                    p.setMarking(false, 0);
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
                audio.updateDiscHum(disc.velocity.length());
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
                    replayRecorder.recordCatch(
                        result.catcher.id,
                        result.catcher.team,
                        { x: disc.position.x, y: disc.position.y, z: disc.position.z },
                    );

                    // Tutorial condition: disc caught
                    tutorial?.checkCondition('disc_caught');

                    if (wasInFlight && thrownBy && !result.isInterception) {
                        teamStats[thrownBy].completions += 1;
                        registerMomentum(thrownBy, 0.35);
                    }

                    if (result.catchQuality === 'contested') {
                        postFX.triggerSmallShake();
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
                        crowdAudio.reactToBlock();
                    }
                    
                    // Trigger continuation mode for quick release
                    if (result.catcher.isControlled) {
                        if (primarySlot.switching.controlledPlayer === result.catcher) {
                            primarySlot.throwCtrl.onCatch();
                        }
                        if (
                            secondarySlot &&
                            secondarySlot.active &&
                            secondarySlot.switching.controlledPlayer === result.catcher
                        ) {
                            secondarySlot.throwCtrl.onCatch();
                        }
                    }
                    
                    if (!isSpectator && saveManager.getSettings().gameplay.autoSwitchOnCatch) {
                        primarySlot.switching.autoSwitchOnCatch(result.catcher, homeTeam);
                        if (secondarySlot && secondarySlot.active) {
                            const p2Team =
                                secondarySlot.team === 'home' ? homeTeam : awayTeam;
                            secondarySlot.switching.autoSwitchOnCatch(result.catcher, p2Team);
                        }
                    }
                    audio.playCatchSound(result.catchQuality, result.isLayout);
                    if (result.isLayout) {
                        audio.playEffortGrunt('layout');
                    } else if (result.catchQuality === 'contested') {
                        audio.playEffortGrunt('catch');
                    }
                    audio.stopDiscHum();
                    particles.emitCatchBurst(
                        disc.position,
                        result.catcher.team === 'home' ? TEAM_A_PRIMARY : TEAM_B_PRIMARY,
                    );

                    // Layout catch effects
                    if (result.isLayout) {
                        postFX.triggerLayoutEffect();
                        crowdAudio.reactToLayout();
                    }
                }
            }

            // Stall HUD + vocal calls
            const currentStall = Math.floor(match.point.stallCount);
            if (currentStall > prevStallCount && currentStall >= 1) {
                vocalSynth.callStall(currentStall);
            }
            prevStallCount = currentStall;
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

            // Minimap toggle (M key)
            const mDown = input.isKeyDown('KeyM');
            if (mDown && !minimapKeyLatch) {
                minimap.toggle();
            }
            minimapKeyLatch = mDown;
            minimap.update(
                allPlayers,
                disc,
                primarySlot.switching.controlledPlayer,
                primarySlot.cameraRig.camera,
            );

            // Rain particles for weather
            if (weatherCondition === 'rain') {
                for (let i = 0; i < 3; i++) {
                    particles.emitRainDrop(FIELD_WIDTH, FIELD_LENGTH);
                }
            }

            // Wind dust from strong gusts
            if (effectiveWindSpeed > 5 && Math.random() < 0.3) {
                const dustOrigin = new THREE.Vector3(
                    (Math.random() - 0.5) * FIELD_WIDTH,
                    0.1,
                    Math.random() * FIELD_LENGTH,
                );
                particles.emitWindDust(
                    dustOrigin,
                    new THREE.Vector2(totalWindX, totalWindZ).normalize(),
                    effectiveWindSpeed,
                );
            }

            // Effects
            grass.update(frameDt, effectiveWindSpeed, effectiveWindDir);
            audio.updateWindAudio(effectiveWindSpeed);
            particles.update(frameDt);

            // Footstep audio for controlled player
            const ctrlPlayer = primarySlot.switching.controlledPlayer;
            if (ctrlPlayer) {
                const speed = ctrlPlayer.movement.velocity.length();
                if (speed > 2) {
                    const stride = speed > 7 ? 2.0 : 1.5;
                    footstepAccum += (speed / stride) * frameDt;
                    if (footstepAccum >= 0.5) {
                        footstepAccum -= 0.5;
                        audio.playFootstep(speed);
                    }
                } else {
                    footstepAccum = 0;
                }
            }

            renderFrame(rawDt, frameDt);
        }

        gameLoopId = requestAnimationFrame(loop);

        // Resize handler
        const resizeHandler = () => {
            renderer.setSize(window.innerWidth, window.innerHeight);
            updateViewports();
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
                inputP2Local?.destroy();
                lanClient?.destroy();
                lanStatusBadge.remove();
                if (spectatorHalftimeAutoTimer !== null) {
                    window.clearTimeout(spectatorHalftimeAutoTimer);
                    spectatorHalftimeAutoTimer = null;
                }
                audio.stopAmbientWind();
                crowdAudio.stopAmbience();
                musicSystem.stop();
                minimap.dispose();
                fieldFlags.dispose();
                tutorial?.stop();
                replayRecorder.stop();
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
                spectatorOverlay?.destroy();
            }
        };
    }
}

main();
