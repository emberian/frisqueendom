import * as THREE from 'three';
import init, { DiscSimulator } from '../frisque-physics/pkg/frisque_physics.js';
import wasmUrl from '../frisque-physics/pkg/frisque_physics_bg.wasm?url';

import { createField } from './rendering/Field';
import { GameCamera } from './rendering/Camera';
import { DiscTrail } from './rendering/DiscTrail';
import { TrajectoryPreview } from './rendering/TrajectoryPreview';
import { GrassField } from './rendering/Grass';
import { Stadium } from './rendering/Stadium';
import { ParticleSystem } from './rendering/Particles';
import { SkySystem } from './rendering/Sky';
import { PostFX } from './rendering/PostFX';
import { DebugVisuals } from './debug/DebugVisuals';
import {
    InputManager,
    type GameplayInputSource,
    type InputViewport,
} from './InputManager';
import type { MenuState } from './ui/Menus';
import { Disc } from './entities/Disc';
import { Team } from './entities/Team';
import type { Player } from './entities/Player';
import { Match } from './gameplay/Match';
import { ThrowController } from './gameplay/Throw';
import { checkCatch } from './gameplay/Catch';
import { PlayerSwitching } from './gameplay/PlayerSwitching';
import {
    TeamAI,
    type AIDifficulty,
    type AIPersonality,
} from './ai/TeamAI';
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
    type MatchSummaryData,
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
import { UNLOCKABLES } from './data/Progression';
import { getPose } from './rendering/Animation';
import { Random } from './data/SeededRandom';
import { FirstMatchOnboarding } from './ui/Onboarding';
import { 
    ReplayRecorder, 
    saveReplay, 
    extractHighlights,
    type DiscThrowEventData,
    type DiscCatchEventData,
    type DiscTurnoverEventData
} from './gameplay/Replay';
import { ReplayPlayer } from './gameplay/ReplayPlayer';
import { HighlightReelPlayer } from './gameplay/HighlightReel';
import { ProgressionManager } from './management/ProgressionManager';
import { applyColorBlindPalette } from './ui/Accessibility';
import {
    MenuSystem,
    type MultiplayerMode,
    type QuickMatchConfig,
} from './ui/Menus';
import { SpiritSystem } from './gameplay/Spirit';
import { CareerManager } from './management/Career';
import {
    saveManager,
    type CareerOpponentData,
    type MatchPlayerStats,
    type MatchResult,
} from './data/SaveLoad';
import { generateRoster } from './data/PlayerStats';
import { NetworkInputProxy } from './network/NetworkInputProxy';
import { LanRelayClient } from './network/LanRelayClient';
import type { FullMatchState } from './network/protocol';
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
import type { TeamSide, OffenseFormation, DefenseFormation } from './data/Types';

type GameMode =
    | 'menu'
    | 'practice'
    | 'quick_match'
    | 'career_match'
    | 'spectator_match'
    | 'highlights_reel';

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

interface PlayerLiveStatLine {
    playerId: string;
    team: TeamSide;
    goals: number;
    assists: number;
    blocks: number;
    throwaways: number;
    drops: number;
    completions: number;
    attempts: number;
    playingTime: number;
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
    
    ProgressionManager.checkDailyReset();

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
    // ── Hash Router ──

    function parseHash(): { path: string; query: URLSearchParams } {
        const raw = window.location.hash.slice(1) || '/title';
        const qIdx = raw.indexOf('?');
        const path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
        const qs = qIdx >= 0 ? raw.slice(qIdx + 1) : '';
        return { path: path || '/title', query: new URLSearchParams(qs) };
    }

    let routeInProgress = false;

    function navigate(path: string, params?: Record<string, string>): void {
        const q = params && Object.keys(params).length
            ? '?' + new URLSearchParams(params).toString() : '';
        history.pushState(null, '', '#' + path + q);
        applyRoute();
    }

    function setHash(path: string, params?: Record<string, string>): void {
        const q = params && Object.keys(params).length
            ? '?' + new URLSearchParams(params).toString() : '';
        history.replaceState(null, '', '#' + path + q);
    }

    function configFromQuery(q: URLSearchParams): QuickMatchConfig {
        return {
            color: q.get('color') || 'blue',
            difficulty: q.get('difficulty') || 'normal',
            gameTo: parseInt(q.get('gameTo') || '11') || 11,
            multiplayerMode: (q.get('multiplayer') as MultiplayerMode) || 'single',
            timeOfDay: q.get('time') || undefined,
            weather: q.get('weather') || undefined,
            randomSeed: q.has('seed') ? parseInt(q.get('seed')!) : undefined,
            lanServerUrl: q.get('relay') || undefined,
            lanRoom: q.get('room') || undefined,
        };
    }

    const MENU_ROUTE_MAP: Record<string, MenuState> = {
        '/title': 'title',
        '/': 'title',
        '/setup': 'match_setup',
        '/career': 'career_menu',
        '/practice': 'practice_menu',
        '/locker': 'locker',
        '/settings': 'settings',
        '/credits': 'credits',
    };

    function applyRoute(): void {
        if (routeInProgress) return;
        routeInProgress = true;
        try {
            const { path, query } = parseHash();

            // Menu routes
            const menuState = MENU_ROUTE_MAP[path];
            if (menuState) {
                if (currentMode !== 'menu') stopGame();
                menuSystem.setState(menuState);
                if (menuState === 'match_setup') {
                    menuSystem.setMatchSetupDefaults(configFromQuery(query));
                }
                return;
            }

            // Game routes
            switch (path) {
                case '/play': {
                    const config = configFromQuery(query);
                    currentMode = 'quick_match';
                    startGame(config);
                    break;
                }
                case '/watch': {
                    const config = configFromQuery(query);
                    config.spectatorMode = true;
                    config.multiplayerMode = 'single';
                    currentMode = 'spectator_match';
                    startGame(config);
                    break;
                }
                case '/tutorial':
                    currentMode = 'quick_match';
                    startGame(
                        { color: 'blue', difficulty: 'easy', gameTo: 3, multiplayerMode: 'single' },
                        true,
                    );
                    break;
                case '/drill': {
                    const drillType = query.get('type') || 'throwing_accuracy';
                    currentMode = 'practice';
                    window.dispatchEvent(
                        new CustomEvent('startPracticeDrill', {
                            detail: { drillType },
                        }),
                    );
                    break;
                }
                case '/join': {
                    const relay = query.get('relay') || DEFAULT_LAN_RELAY_URL;
                    const room = query.get('room') || 'fqd-room-1';
                    const mode = query.get('mode') || 'spectator';
                    const config: QuickMatchConfig = {
                        color: 'blue',
                        difficulty: 'normal',
                        gameTo: 11,
                        multiplayerMode:
                            mode === 'spectator' ? 'lan_spectator' : 'lan_remote',
                        lanServerUrl: relay,
                        lanRoom: room,
                    };
                    currentMode =
                        mode === 'spectator' ? 'spectator_match' : 'quick_match';
                    startGame(config);
                    break;
                }
                default:
                    if (currentMode !== 'menu') stopGame();
                    menuSystem.setState('title');
                    break;
            }
        } finally {
            routeInProgress = false;
        }
    }

    window.addEventListener('popstate', () => applyRoute());

    // ── Menu System ──

    const menuSystem = new MenuSystem(menuContainer, (state) => {
        if (state === 'none') {
            menuSystem.hide();
        } else {
            menuSystem.show();
        }
    }, navigate);

    // Lobby Browser Client
    let browserClient: LanRelayClient | null = null;
    const initBrowser = () => {
        if (browserClient) return;
        browserClient = new LanRelayClient({
            url: DEFAULT_LAN_RELAY_URL,
            role: 'browser',
            onRoomList: (rooms) => menuSystem.updateLobby(rooms),
            onConnectionState: () => {},
        });
        browserClient.connect();

        // Periodic refresh
        setInterval(() => {
            if (menuSystem.getState() === 'title') {
                browserClient?.listRooms();
            }
        }, 5000);
    };
    // Apply initial route (may navigate to a menu screen or start a game)
    applyRoute();
    if (menuSystem.getState() === 'title') initBrowser();

    window.addEventListener('refreshLobby', () => {
        browserClient?.listRooms();
    });

    window.addEventListener('joinLobbyRoom', ((e: CustomEvent) => {
        navigate('/join', { room: e.detail.room, mode: 'spectator' });
    }) as EventListener);

    // Event listeners for menu actions (fallbacks — menus now use navigate() directly)
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
                () => { stopGame(); navigate('/title'); }
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
        setHash('/title');
    }

    function startGame(matchConfig?: QuickMatchConfig, tutorialMode?: boolean): void {
        const careerEvent =
            currentMode === 'career_match' && careerManager
                ? careerManager.getCurrentEvent()
                : null;
        const careerOpponent: CareerOpponentData | null =
            careerEvent?.type === 'tournament' ? careerEvent.opponent : null;
        const scoutingPlan =
            currentMode === 'career_match' && careerManager && careerOpponent
                ? careerManager.getCurrentScoutingPlan()
                : {
                      bonus: 0,
                      report: null,
                      recommendedDefense: null as 'man' | 'zone_331' | null,
                  };
        if (currentMode === 'career_match' && (!careerManager || !careerOpponent)) {
            menuSystem.setState('career_menu');
            return;
        }

        menuSystem.hide();

        // Sync hash to reflect current game
        if (currentMode === 'spectator_match') {
            setHash('/watch', matchConfig ? {
                difficulty: matchConfig.difficulty,
                gameTo: String(matchConfig.gameTo),
                ...(matchConfig.weather ? { weather: matchConfig.weather } : {}),
                ...(matchConfig.timeOfDay ? { time: matchConfig.timeOfDay } : {}),
            } : {});
        } else if (currentMode === 'quick_match' && matchConfig) {
            const p: Record<string, string> = {
                color: matchConfig.color,
                difficulty: matchConfig.difficulty,
                gameTo: String(matchConfig.gameTo),
            };
            if (matchConfig.multiplayerMode !== 'single') p.multiplayer = matchConfig.multiplayerMode;
            if (matchConfig.timeOfDay) p.time = matchConfig.timeOfDay;
            if (matchConfig.weather) p.weather = matchConfig.weather;
            if (matchConfig.lanServerUrl) p.relay = matchConfig.lanServerUrl;
            if (matchConfig.lanRoom) p.room = matchConfig.lanRoom;
            setHash('/play', p);
        } else if (currentMode === 'career_match') {
            setHash('/career');
        }

        const multiplayerMode: MultiplayerMode =
            currentMode === 'quick_match'
                ? matchConfig?.multiplayerMode ?? 'single'
                : 'single';
        const splitScreenEnabled = multiplayerMode === 'local_split';
        const lanRemoteEnabled = multiplayerMode === 'lan_remote';
        const lanSpectatorMode = multiplayerMode === 'lan_spectator';

        // Seed randomness
        const matchSeed = matchConfig?.randomSeed ?? Math.floor(Math.random() * 2147483647);
        Random.seed(matchSeed);

        const isSpectator =
            currentMode === 'spectator_match' ||
            lanSpectatorMode ||
            Boolean(matchConfig?.spectatorMode);
        
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
        if (isSpectator) {
            gameCamera.snapTo('overview', new THREE.Vector3(0, 0, 50));
        }
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

        if (currentMode === 'career_match' && careerManager && careerOpponent) {
            homeTeamColors = {
                primary: careerManager.data.team.primaryColor,
                secondary: careerManager.data.team.secondaryColor,
            };
            awayTeamColors = {
                primary: careerOpponent.primaryColor,
                secondary: careerOpponent.secondaryColor,
            };
        } else if (matchConfig?.color === 'red') {
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
        const awayTeamName =
            currentMode === 'career_match' && careerOpponent
                ? careerOpponent.teamName
                : currentMode === 'career_match'
                ? 'Rivals'
                : 'Away';

        const homeTeam = Team.create(homeTeamName, homeTeamColors.primary, homeTeamColors.secondary, 'home', scene);
        const awayTeam = Team.create(awayTeamName, awayTeamColors.primary, awayTeamColors.secondary, 'away', scene);
        const stadium = new Stadium(scene, homeTeamColors.primary);
        
        const careerLineupUsage = new Set<string>();
        const applyCareerLineupToHome = (isReceiving: boolean): void => {
            if (currentMode !== 'career_match' || !careerManager) return;
            const lineup = careerManager.getLineupForPoint(isReceiving);
            if (lineup.length < 7) return;

            const captainIds = careerManager.data.captainIds || [];
            for (let i = 0; i < Math.min(7, lineup.length, homeTeam.players.length); i++) {
                const playerStats = lineup[i];
                careerLineupUsage.add(playerStats.id);
                let chemistryBoost = 0;
                let chemistrySamples = 0;
                for (const teammate of lineup) {
                    if (teammate.id === playerStats.id) continue;
                    chemistryBoost += careerManager.getChemistry(playerStats.id, teammate.id);
                    chemistrySamples++;
                }
                let captainChem = 0;
                let captainSamples = 0;
                for (const captainId of captainIds) {
                    if (captainId === playerStats.id) continue;
                    captainChem += careerManager.getChemistry(playerStats.id, captainId);
                    captainSamples++;
                }
                const avgChemistry =
                    chemistrySamples > 0 ? chemistryBoost / chemistrySamples : 0;
                const avgCaptainChem = captainSamples > 0 ? captainChem / captainSamples : 0;
                playerStats.form = Math.max(
                    -20,
                    Math.min(
                        20,
                        playerStats.form +
                            avgChemistry * 1.8 +
                            avgCaptainChem +
                            scoutingPlan.bonus * 0.55,
                    ),
                );
                homeTeam.players[i].setStats(playerStats);
            }
        };

        // Attach career stats to players if in career mode
        if (currentMode === 'career_match' && careerManager) {
            // Opening pull has the home team on defense.
            applyCareerLineupToHome(false);
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
        postFX.init(renderer, scene, gameCamera.camera);
        const debugVisuals = new DebugVisuals();

        // Apply Cosmetics
        const progression = saveManager.getProgression();
        const equipped = progression.equippedCosmetics;
        
        // Trail
        if (equipped.trail) {
            const item = UNLOCKABLES.find(
                (u) => u.id === equipped.trail && u.type === 'trail',
            );
            if (item) {
                discTrail.setOverrideColor(item.assetKey);
            }
        }

        // Home Team Cosmetics (Player controlled team usually)
        if (equipped.cosmetic) {
            const item = UNLOCKABLES.find(
                (u) => u.id === equipped.cosmetic && u.type === 'cosmetic',
            );
            if (item) {
                for (const p of homeTeam.players) {
                    p.stickman.setAccent(item.assetKey);
                }
            }
        }
        if (equipped.celebration) {
            const item = UNLOCKABLES.find(
                (u) => u.id === equipped.celebration && u.type === 'celebration',
            );
            if (item) {
                for (const p of homeTeam.players) {
                    p.setCustomCelebration(item.assetKey);
                }
            }
        }

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

        const startAudio = (e?: Event) => {
            if (e && e instanceof KeyboardEvent) {
                if (!e.metaKey && !e.ctrlKey && e.code !== 'F12' && e.code !== 'F11' && e.code !== 'F5') {
                    e.preventDefault();
                }
            }
            if (!audioStarted) {
                audioStarted = true;
                audio.startAmbientWind(windSpeed);
                crowdAudio.startAmbience(0.5);
                musicSystem.start();
            }
        };
        window.addEventListener('click', () => startAudio(), { once: true });
        window.addEventListener('keydown', startAudio, { once: true });

        // Multi-Controller slots
        const controllerSlots: ControllerSlot[] = [];
        const networkProxies = new Map<string, NetworkInputProxy>();

        // Default primary slot
        const input = new InputManager({
            gamepadOrder: 0,
            allowTouch: !isSpectator,
        });
        const primarySlot: ControllerSlot = {
            team: 'home',
            input: input,
            switching: new PlayerSwitching(),
            throwCtrl: new ThrowController(),
            cameraRig: gameCamera,
            switchCooldown: 0,
            viewport: makeViewport(0, 0, window.innerWidth, window.innerHeight),
            active: !isSpectator,
        };
        controllerSlots.push(primarySlot);

        // Optional local P2 slot
        if (splitScreenEnabled) {
            const p2Input = new InputManager({
                enableKeyboardMouse: false,
                allowTouch: false,
                gamepadOrder: 1,
            });
            controllerSlots.push({
                team: 'away',
                input: p2Input,
                switching: new PlayerSwitching(),
                throwCtrl: new ThrowController(),
                cameraRig: gameCameraP2!,
                switchCooldown: 0,
                viewport: makeViewport(0, 0, window.innerWidth, window.innerHeight),
                active: true,
            });
        }

        const shouldConnectLAN =
            lanRemoteEnabled ||
            lanSpectatorMode ||
            (multiplayerMode === 'single' && !isSpectator);
        const lanStatusBadge = shouldConnectLAN ? createLanStatusBadge() : null;

        // Spectator Interpolation
        const stateBuffer: FullMatchState[] = [];
        let remoteRenderTime = 0;
        const INTERPOLATION_DELAY = 100; // ms
        const _s0Pos = new THREE.Vector3();
        const _s1Pos = new THREE.Vector3();
        const _s0Vel = new THREE.Vector3();
        const _s1Vel = new THREE.Vector3();

        const lanRoom =
            matchConfig?.lanRoom ||
            (multiplayerMode === 'single'
                ? `solo-${Math.random().toString(36).substring(2, 7)}`
                : 'fqd-room-1');
        
        const lanClient = shouldConnectLAN
            ? new LanRelayClient({
                  url: matchConfig?.lanServerUrl || DEFAULT_LAN_RELAY_URL,
                  room: lanRoom,
                  role: lanSpectatorMode ? 'spectator' : 'host',
                  onControllerState: (id, state) => {
                      if (lanSpectatorMode) return;
                      let proxy = networkProxies.get(id);
                      if (!proxy && controllerSlots.length < 14) {
                          proxy = new NetworkInputProxy();
                          networkProxies.set(id, proxy);
                          
                          // Create new slot for this network controller
                          const team: TeamSide = controllerSlots.filter(s => s.team === 'home').length <= 
                                               controllerSlots.filter(s => s.team === 'away').length 
                                               ? 'home' : 'away';
                          
                          const newSlot: ControllerSlot = {
                              team,
                              input: proxy,
                              switching: new PlayerSwitching(),
                              throwCtrl: new ThrowController(),
                              cameraRig: team === 'home' ? gameCamera : gameCameraP2!,
                              switchCooldown: 0,
                              viewport: primarySlot.viewport, // Shared team viewport
                              active: true,
                          };
                          controllerSlots.push(newSlot);
                          
                          // Assign initial player
                          const teamObj = team === 'home' ? homeTeam : awayTeam;
                          const availablePlayer = teamObj.players.find(p => !p.isControlled);
                          if (availablePlayer) newSlot.switching.switchTo(availablePlayer);
                      }
                      if (proxy) proxy.applyState(state);
                  },
                  onBroadcastState: (remoteState) => {
                      if (!lanSpectatorMode) return;
                      
                      // Buffer state for interpolation
                      stateBuffer.push(remoteState);
                      
                      // Keep buffer size reasonable
                      if (stateBuffer.length > 20) {
                          stateBuffer.shift();
                      }

                      // Initialize render time on first packet
                      if (remoteRenderTime === 0) {
                          remoteRenderTime = remoteState.timestamp - INTERPOLATION_DELAY;
                      }
                  },
                  onConnectionState: (connected, text) => {
                      if (!lanStatusBadge) return;
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
        const opponentDifficulty =
            currentMode === 'career_match' && careerManager
                ? careerManager.getCurrentOpponentDifficulty()
                : currentMode === 'practice'
                ? 'easy'
                : toAIDifficulty(matchConfig?.difficulty);
        const homeDifficulty: AIDifficulty = isSpectator
            ? opponentDifficulty
            : currentMode === 'practice'
            ? 'normal'
            : 'normal';
        homeAI.setDifficulty(homeDifficulty);
        awayAI.setDifficulty(opponentDifficulty);
        const pickPersonality = (
            level: AIDifficulty,
            roll: number,
        ): AIPersonality => {
            if (level === 'hard') {
                if (roll < 0.3) return 'huck_heavy';
                if (roll < 0.58) return 'poach_chaos';
                if (roll < 0.78) return 'patient_small_ball';
                return 'balanced';
            }
            if (level === 'easy') {
                if (roll < 0.42) return 'patient_small_ball';
                if (roll < 0.82) return 'balanced';
                if (roll < 0.92) return 'huck_heavy';
                return 'poach_chaos';
            }
            if (roll < 0.3) return 'balanced';
            if (roll < 0.55) return 'huck_heavy';
            if (roll < 0.8) return 'patient_small_ball';
            return 'poach_chaos';
        };
        const allPersonalities: AIPersonality[] = [
            'balanced',
            'patient_small_ball',
            'huck_heavy',
            'poach_chaos',
        ];
        let homePersonality = pickPersonality(homeDifficulty, Random.next());
        let awayPersonality = pickPersonality(opponentDifficulty, Random.next());
        if (homePersonality === awayPersonality && Random.next() < 0.75) {
            const alternatives = allPersonalities.filter(
                (personality) => personality !== homePersonality,
            );
            awayPersonality =
                alternatives[Math.floor(Random.next() * alternatives.length)] ||
                awayPersonality;
        }
        homeAI.setPersonality(homePersonality);
        awayAI.setPersonality(awayPersonality);
        if (currentMode === 'career_match' && careerManager) {
            const manager = careerManager;
            const activeFormation =
                manager.data.playbook.formations.find(
                    (formation) => formation.id === manager.data.activeFormationId,
                ) || manager.data.playbook.formations[0] || null;
            const activePlay =
                manager.data.activePlayId
                    ? manager.data.playbook.plays.find(
                          (play) => play.id === manager.data.activePlayId,
                      ) || null
                    : null;
            homeAI.setPlaybookContext(activeFormation, activePlay);
            // Opponents should not mirror the player's scripted playbook.
            awayAI.setPlaybookContext(null, null);
        } else {
            homeAI.setPlaybookContext(null, null);
            awayAI.setPlaybookContext(null, null);
        }
        const pickFormation = (
            level: AIDifficulty,
            personality: AIPersonality,
            roll: number,
        ): OffenseFormation => {
            if (personality === 'huck_heavy') return roll < 0.78 ? 'horizontal_stack' : 'vertical_stack';
            if (personality === 'patient_small_ball') return roll < 0.2 ? 'horizontal_stack' : 'vertical_stack';
            if (personality === 'poach_chaos') return roll < 0.55 ? 'horizontal_stack' : 'vertical_stack';
            if (level === 'hard') return roll < 0.6 ? 'horizontal_stack' : 'vertical_stack';
            if (level === 'easy') return roll < 0.2 ? 'horizontal_stack' : 'vertical_stack';
            return roll < 0.4 ? 'horizontal_stack' : 'vertical_stack';
        };
        const pickDefense = (
            level: AIDifficulty,
            personality: AIPersonality,
            roll: number,
        ): DefenseFormation => {
            if (personality === 'poach_chaos') return roll < 0.72 ? 'zone_331' : 'man';
            if (personality === 'patient_small_ball') return roll < 0.18 ? 'zone_331' : 'man';
            if (level === 'hard') return roll < 0.55 ? 'zone_331' : 'man';
            if (level === 'easy') return roll < 0.1 ? 'zone_331' : 'man';
            return roll < 0.25 ? 'zone_331' : 'man';
        };
        const homeFormation = pickFormation(
            homeDifficulty,
            homePersonality,
            Random.next(),
        );
        const awayFormation = pickFormation(
            opponentDifficulty,
            awayPersonality,
            Random.next(),
        );
        const homeDefense = pickDefense(
            homeDifficulty,
            homePersonality,
            Random.next(),
        );
        const awayDefense = pickDefense(
            opponentDifficulty,
            awayPersonality,
            Random.next(),
        );
        homeAI.setFormation(homeFormation);
        awayAI.setFormation(awayFormation);
        if (
            currentMode === 'career_match' &&
            scoutingPlan.recommendedDefense &&
            scoutingPlan.bonus > 0.2
        ) {
            homeAI.setDefenseType(scoutingPlan.recommendedDefense);
        } else {
            homeAI.setDefenseType(homeDefense);
        }
        awayAI.setDefenseType(awayDefense);

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

        const saveData = saveManager.load() ?? saveManager.createNewSave();
        if (!saveManager.hasSave()) {
            saveManager.save(saveData);
        }

        // Tutorial system
        const tutorial = tutorialMode
            ? new TutorialSystem(document.getElementById('ui')!, () => {
                  const save = saveManager.load() || saveManager.createNewSave();
                  save.tutorialCompleted = true;
                  saveManager.save(save);
                  stopGame();
                  menuSystem.setState('title');
              })
            : null;
        if (tutorial) {
            tutorial.start(1);
        }
        const onboarding =
            !tutorialMode &&
            !isSpectator &&
            currentMode === 'quick_match' &&
            !saveData.tutorialCompleted
                ? new FirstMatchOnboarding(document.getElementById('ui')!, input.isTouchControlsEnabled(), () => {
                      const save = saveManager.load() || saveManager.createNewSave();
                      save.tutorialCompleted = true;
                      saveManager.save(save);
                  })
                : null;

        // Replay recorder
        const replayRecorder = new ReplayRecorder();
        const replayPlayer = new ReplayPlayer();
        const highlightPlayer = new HighlightReelPlayer(replayPlayer, {
            onClipStart: (h) => {
                broadcast.showStatusText(h.description, 3.0);
                vocalSynth.announceScore(); // Just a generic 'exciting' sound for now
            },
            onReelEnd: () => {
                stopGame();
                menuSystem.setState('title');
            }
        });

        // Highlight event listeners for audio/visuals
        replayPlayer.onEvent('disc_throw', (data: any) => {
            if (currentMode !== 'highlights_reel') return;
            const d = data as DiscThrowEventData;
            audio.playThrowSound(d.throwParams.speed, 'backhand'); // Default to backhand sound
            audio.startDiscHum();
        });

        replayPlayer.onEvent('disc_catch', (data: any) => {
            if (currentMode !== 'highlights_reel') return;
            const d = data as DiscCatchEventData;
            audio.playCatchSound();
            audio.stopDiscHum();
            particles.emitCatchBurst(new THREE.Vector3(d.position.x, d.position.y, d.position.z), 0xffffff);
        });

        replayPlayer.onEvent('disc_score', () => {
            if (currentMode !== 'highlights_reel') return;
            audio.playScoreJingle();
            crowdAudio.reactToScore();
            stadium.triggerCheer();
            postFX.triggerScoreEffect();
        });

        replayPlayer.onEvent('disc_turnover', (data: any) => {
            if (currentMode !== 'highlights_reel') return;
            const d = data as DiscTurnoverEventData;
            if (d.reason === 'block') {
                audio.playBlockSound();
                crowdAudio.reactToBlock();
                stadium.triggerCheer(0.5);
                postFX.triggerBlockShake();
            }
            audio.stopDiscHum();
        });

        replayPlayer.onEvent('state_snapshot', (data: any) => {
            if (currentMode !== 'highlights_reel') return;
            const remoteState = data as FullMatchState;
            
            // Apply state similar to spectator mode
            match.score = remoteState.score;
            match.point.stallCount = remoteState.stall;
            match.phase = remoteState.phase as any;
            match.offenseTeam = remoteState.offenseTeam as any;
            match.showStatusText(remoteState.statusText, remoteState.statusTextActive);
            
            Random.seed(remoteState.randomSeed);

            disc.position.set(remoteState.disc.pos.x, remoteState.disc.pos.y, remoteState.disc.pos.z);
            disc.velocity.set(remoteState.disc.vel.x, remoteState.disc.vel.y, remoteState.disc.vel.z);
            disc.state = remoteState.disc.state as any;

            for (const pState of remoteState.players) {
                const player = allPlayers.find(p => p.id === pState.id);
                if (player) {
                    player.movement.position.set(pState.pos.x, 0, pState.pos.z);
                    player.movement.facing = pState.facing;
                    player.holdingDisc = pState.holding;
                    player.isMarking = pState.marking;
                    player.markStallIntensity = pState.markPct;
                    player.stickman.setAccent(pState.accent);
                    player.setRemotePose(pState.anim, pState.animTime);
                }
            }
        });
        replayRecorder.start(
            Math.floor(Math.random() * 2147483647),
            { home: homeTeam.name, away: awayTeam.name },
            { gameTo: match.getGameTo(), homeTeam: 'home', awayTeam: 'away' },
        );

        if (!isSpectator) {
            primarySlot.switching.switchTo(homeTeam.players[0]);
            // If P2 is local, assign them to away team's first player
            if (controllerSlots.length > 1 && !lanRemoteEnabled) {
                controllerSlots[1].switching.switchTo(awayTeam.players[0]);
            }
        }

        // Debug
        (window as unknown as { __game?: object }).__game = {
            match,
            disc,
            homeTeam,
            awayTeam,
            controllerSlots,
            discSim,
            spiritSystem,
        };

        // Game loop variables
        const followTarget = new THREE.Vector3(0, 0, 50);
        const followTargetP2 = new THREE.Vector3(0, 0, 50);
        let physicsAccumulator = 0;
        let trailTimer = 0;
        let autoPullTimer = 0;
        let broadcastStateTimer = 0;
        let metadataTimer = 0;
        let snapshotTimer = 0;
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
        const stallTurnoversByTeam: Record<TeamSide, number> = {
            home: 0,
            away: 0,
        };
        const momentumEvents: Array<{
            team: TeamSide;
            weight: number;
            timestamp: number;
        }> = [];
        const matchStartTime = performance.now();
        const performanceMap = new Map<
            string,
            {
                playerId: string;
                name: string;
                teamName: string;
                goals: number;
                blocks: number;
            }
        >();
        const playerStatsMap = new Map<string, PlayerLiveStatLine>();
        const lastThrowerByTeam: Partial<Record<TeamSide, string>> = {};
        const lastCompletedPassByTeam: Partial<
            Record<TeamSide, { throwerId: string; receiverId: string }>
        > = {};
        const dropTurnoverTeam: Partial<Record<TeamSide, boolean>> = {};
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
            const holderSpeed = disc.holder
                ? Math.hypot(disc.holder.movement.velocity.x, disc.holder.movement.velocity.z)
                : 0;
            if (holderSpeed > 3.2 || match.point.stallCount >= 7) {
                return 'disc';
            }
            return 'broadcast';
        }

        function applySpectatorCamera(dt: number): void {
            if (spectatorView === 'auto') {
                // Full-field overview — target field center
                spectatorTarget.set(0, 0, 50);
                gameCamera.setMode('overview');
                gameCamera.update(dt, spectatorTarget);
                return;
            }
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
            playerId?: string,
        ): void {
            matchEvents.push({
                timeLabel: formatClockLabel((performance.now() - matchStartTime) / 1000),
                type,
                text,
                playerId,
            });
        }

        function getPlayerLine(team: TeamSide, playerId: string): PlayerLiveStatLine {
            const existing = playerStatsMap.get(playerId);
            if (existing) return existing;

            const line: PlayerLiveStatLine = {
                playerId,
                team,
                goals: 0,
                assists: 0,
                blocks: 0,
                throwaways: 0,
                drops: 0,
                completions: 0,
                attempts: 0,
                playingTime: 0,
            };
            playerStatsMap.set(playerId, line);
            return line;
        }

        function addGoal(
            playerId: string,
            playerName: string,
            teamName: string,
            team: TeamSide,
        ): void {
            const perf = performanceMap.get(playerId) ?? {
                playerId,
                name: playerName,
                teamName,
                goals: 0,
                blocks: 0,
            };
            perf.goals += 1;
            performanceMap.set(playerId, perf);

            getPlayerLine(team, playerId).goals += 1;

            const lastPass = lastCompletedPassByTeam[team];
            if (lastPass && lastPass.receiverId === playerId) {
                getPlayerLine(team, lastPass.throwerId).assists += 1;
            }
        }

        function addBlock(
            playerId: string,
            playerName: string,
            teamName: string,
            team: TeamSide,
        ): void {
            const perf = performanceMap.get(playerId) ?? {
                playerId,
                name: playerName,
                teamName,
                goals: 0,
                blocks: 0,
            };
            perf.blocks += 1;
            performanceMap.set(playerId, perf);

            getPlayerLine(team, playerId).blocks += 1;
        }

        function registerThrowAttempt(
            team: TeamSide,
            throwerId: string,
            estimatedDistance: number,
        ): void {
            teamStats[team].attempts += 1;
            teamStats[team].longThrowMeters = Math.max(
                teamStats[team].longThrowMeters,
                estimatedDistance,
            );
            getPlayerLine(team, throwerId).attempts += 1;
            lastThrowerByTeam[team] = throwerId;
            dropTurnoverTeam[team] = false;
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
                    playerId: perf.playerId,
                    name: perf.name,
                    teamName: perf.teamName,
                    goals: perf.goals,
                    blocks: perf.blocks,
                    impact: perf.goals * 3 + perf.blocks * 2,
                }))
                .sort((a, b) => b.impact - a.impact || b.goals - a.goals);
        }

        function getTeamName(team: TeamSide): string {
            return team === 'home' ? homeTeam.name : awayTeam.name;
        }

        function buildProgressionData(
            performers: PerformerLine[],
        ): MatchSummaryData['progression'] {
            if (isSpectator) return undefined;

            const playerTeam = match.playerTeam;
            const teamScore = playerTeam === 'home' ? match.score[0] : match.score[1];
            const teamName = getTeamName(playerTeam);
            
            // Calculate stats for progression
            const isWin = playerTeam === 'home' 
                ? match.score[0] > match.score[1]
                : match.score[1] > match.score[0];
                
            const teamBlocks = performers
                .filter((line) => line.teamName === teamName)
                .reduce((total, line) => total + line.blocks, 0);

            // Process via ProgressionManager
            const result = ProgressionManager.processMatch({
                win: isWin,
                goals: teamScore,
                blocks: teamBlocks,
                completions: teamStats[playerTeam].completions,
                stallTurnovers: stallTurnoversByTeam[playerTeam],
            });

            if (currentMode !== 'career_match') {
                const currentStats = saveManager.getStats();
                saveManager.updateStats({
                    totalGamesPlayed: currentStats.totalGamesPlayed + 1,
                    totalPointsScored: currentStats.totalPointsScored + teamScore,
                    totalPointsPlayed:
                        currentStats.totalPointsPlayed +
                        teamScore +
                        (playerTeam === 'home' ? match.score[1] : match.score[0]),
                    careerGoals: currentStats.careerGoals + teamScore,
                    careerBlocks: currentStats.careerBlocks + teamBlocks,
                    careerTurnovers:
                        currentStats.careerTurnovers + teamStats[playerTeam].turnovers,
                    careerCompletions:
                        currentStats.careerCompletions +
                        teamStats[playerTeam].completions,
                    careerAttempts:
                        currentStats.careerAttempts + teamStats[playerTeam].attempts,
                    totalWins: currentStats.totalWins + (isWin ? 1 : 0),
                    totalLosses: currentStats.totalLosses + (isWin ? 0 : 1),
                    totalSpiritScore:
                        currentStats.totalSpiritScore +
                        spiritSystem.getPlayerTeamSpirit().total,
                });
            }

            return {
                result,
                currentData: saveManager.getProgression(),
            };
        }

        function buildCareerMatchResult(
            performers: PerformerLine[],
        ): MatchResult | null {
            if (currentMode !== 'career_match' || !careerManager) {
                return null;
            }

            const trackedIds = new Set<string>(careerLineupUsage);
            for (const line of playerStatsMap.values()) {
                if (line.team === 'home') trackedIds.add(line.playerId);
            }

            const rosterById = new Map(
                careerManager.data.team.roster.map((player) => [player.id, player] as const),
            );
            const scoreA = match.score[0];
            const scoreB = match.score[1];
            const statLines: MatchPlayerStats[] = [...trackedIds]
                .map((playerId) => rosterById.get(playerId))
                .filter((player): player is NonNullable<typeof player> => !!player)
                .map((player) => {
                const line = playerStatsMap.get(player.id);
                const goals = line?.goals ?? 0;
                const assists = line?.assists ?? 0;
                const blocks = line?.blocks ?? 0;
                const throwaways = line?.throwaways ?? 0;
                const drops = line?.drops ?? 0;
                const completions = line?.completions ?? 0;
                const attempts = line?.attempts ?? 0;
                return {
                    playerId: player.id,
                    goals,
                    assists,
                    blocks,
                    throwaways,
                    drops,
                    completions,
                    attempts,
                    plusMinus: goals + assists + blocks - throwaways - drops,
                    playingTime: line?.playingTime ?? 0,
                };
            })
                .sort((a, b) => b.playingTime - a.playingTime);

            const highlights = matchEvents
                .map((event) => {
                    if (!event.playerId) return null;
                    if (event.type === 'goal') {
                        return {
                            type: 'goal' as const,
                            playerId: event.playerId,
                            timestamp: 0,
                            description: event.text,
                        };
                    }
                    if (event.type === 'block') {
                        return {
                            type: 'block' as const,
                            playerId: event.playerId,
                            timestamp: 0,
                            description: event.text,
                        };
                    }
                    return null;
                })
                .filter((item): item is NonNullable<typeof item> => item !== null);

            return {
                id: `career_match_${Date.now()}`,
                date: Date.now(),
                opponentName: awayTeam.name,
                opponentTeamId: careerOpponent?.teamId,
                opponentRating: careerOpponent?.rating ?? 60,
                playerScore: scoreA,
                opponentScore: scoreB,
                playerSpirit: spiritSystem.getPlayerTeamSpirit().total,
                opponentSpirit: spiritSystem.getAITeamSpirit().total,
                stats: statLines,
                highlights,
            };
        }

        function updateViewports(): void {
            const hasAwayHuman = controllerSlots.some(s => s.team === 'away' && s.active);
            if (splitScreenEnabled && hasAwayHuman) {
                const halfWidth = Math.floor(window.innerWidth / 2);
                const leftVp = makeViewport(0, 0, halfWidth, window.innerHeight);
                const rightVp = makeViewport(halfWidth, 0, window.innerWidth - halfWidth, window.innerHeight);
                
                for (const slot of controllerSlots) {
                    slot.viewport = slot.team === 'home' ? leftVp : rightVp;
                }
            } else {
                const fullVp = makeViewport(0, 0, window.innerWidth, window.innerHeight);
                for (const slot of controllerSlots) {
                    slot.viewport = fullVp;
                }
            }
            
            setCameraViewportAspect(gameCamera, primarySlot.viewport);
            if (gameCameraP2) {
                setCameraViewportAspect(gameCameraP2, controllerSlots.find(s => s.team === 'away')?.viewport || primarySlot.viewport);
            }
        }

        updateViewports();

        function getTeamCameraTargets(team: TeamSide): THREE.Vector3[] {
            const targets: THREE.Vector3[] = [];
            if (disc.state === 'in_flight') {
                targets.push(disc.position);
            }
            
            for (const slot of controllerSlots) {
                if (slot.team === team && slot.active && slot.switching.controlledPlayer) {
                    targets.push(slot.switching.controlledPlayer.movement.position);
                }
            }
            
            // Fallback if no human players active
            if (targets.length === 0) {
                targets.push(new THREE.Vector3(0, 0, team === 'home' ? 30 : -30));
            }
            return targets;
        }

        function renderFrame(rawDt: number, frameDt: number): void {
            if (isSpectator || currentMode === 'highlights_reel') {
                if (currentMode === 'highlights_reel') {
                    gameCamera.setMode('follow_disc');
                    gameCamera.update(frameDt, disc.position);
                } else {
                    applySpectatorCamera(frameDt);
                }
                postFX.update(rawDt, gameCamera.camera);
                postFX.render();
                debugVisuals.render(renderer, gameCamera.camera);
                return;
            }

            // Update team cameras
            const homeTargets = getTeamCameraTargets('home');
            gameCamera.setMode(disc.state === 'in_flight' ? 'follow_disc' : 'follow_player');
            gameCamera.update(frameDt, homeTargets);

            const hasAwayHuman = controllerSlots.some(s => s.team === 'away' && s.active);
            if (gameCameraP2 && hasAwayHuman) {
                const awayTargets = getTeamCameraTargets('away');
                gameCameraP2.setMode(disc.state === 'in_flight' ? 'follow_disc' : 'follow_player');
                gameCameraP2.update(frameDt, awayTargets);
            }

            postFX.update(rawDt, gameCamera.camera);
            
            if (!splitScreenEnabled || !hasAwayHuman) {
                postFX.render();
                debugVisuals.render(renderer, gameCamera.camera);
                return;
            }

            renderer.setScissorTest(true);

            // Render Home side (PostFX not supported in split-screen currently)
            const left = primarySlot.viewport;
            renderer.setViewport(left.x, left.y, left.width, left.height);
            renderer.setScissor(left.x, left.y, left.width, left.height);
            renderer.render(scene, gameCamera.camera);

            // Render Away side
            if (gameCameraP2) {
                const awaySlot = controllerSlots.find(s => s.team === 'away' && s.active);
                if (awaySlot) {
                    const right = awaySlot.viewport;
                    renderer.setViewport(right.x, right.y, right.width, right.height);
                    renderer.setScissor(right.x, right.y, right.width, right.height);
                    renderer.render(scene, gameCameraP2.camera);
                }
            }

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

            // Update all inputs
            for (const slot of controllerSlots) {
                if (slot.active) {
                    slot.input.update(frameDt, slot.viewport);
                }
            }

            const pausePressed = isSpectator
                ? keyJustPressed('Escape')
                : controllerSlots.some(s => s.active && s.input.isPausePressed());
            if (pausePressed && !pauseLatch) {
                togglePause();
            }
            pauseLatch = pausePressed;
            if (isPaused) return;

            if (currentMode === 'highlights_reel') {
                highlightPlayer.update(frameDt);
                renderFrame(rawDt, frameDt);
                return;
            }

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
                if (keyJustPressed('KeyD')) {
                    debugVisuals.setVisible(!debugVisuals.isVisible());
                    homeAI.debugEnabled = debugVisuals.isVisible();
                    awayAI.debugEnabled = debugVisuals.isVisible();
                }
                if (keyJustPressed('KeyF') && debugVisuals.isVisible()) {
                    debugVisuals.cycleFocus();
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
            disc.bridge.setWind(effectiveWindSpeed, effectiveWindDir);
            disc.bridge.updateWind(frameDt);
            fieldFlags.setWind(effectiveWindSpeed, effectiveWindDir);
            fieldFlags.update(frameDt);
            broadcast.update(frameDt);

            // Match state
            if (!lanSpectatorMode) {
                match.update(frameDt, homeTeam, awayTeam, disc);
            } else {
                // Apply Interpolation
                remoteRenderTime += rawDt * 1000; // Advance in real time (ms)
                
                // Drift correction: if we're too far behind or have no data ahead, snap
                if (stateBuffer.length > 0) {
                    const latestTime = stateBuffer[stateBuffer.length - 1].timestamp;
                    const oldestTime = stateBuffer[0].timestamp;
                    
                    if (remoteRenderTime < oldestTime || remoteRenderTime > latestTime) {
                        // Snap to 100ms behind latest
                        remoteRenderTime = latestTime - INTERPOLATION_DELAY;
                    }
                }

                // Find the two states to interpolate between
                let s0: FullMatchState | null = null;
                let s1: FullMatchState | null = null;
                
                for (let i = 0; i < stateBuffer.length - 1; i++) {
                    if (stateBuffer[i].timestamp <= remoteRenderTime && stateBuffer[i+1].timestamp >= remoteRenderTime) {
                        s0 = stateBuffer[i];
                        s1 = stateBuffer[i+1];
                        break;
                    }
                }
                
                if (s0 && s1) {
                    const t = (remoteRenderTime - s0.timestamp) / (s1.timestamp - s0.timestamp);
                    
                    // Interpolate Match State (from s1 mostly for logic)
                    match.score = s1.score;
                    match.point.stallCount = s1.stall;
                    match.phase = s1.phase as any;
                    match.offenseTeam = s1.offenseTeam as any;
                    match.showStatusText(s1.statusText, s1.statusTextActive);
                    Random.seed(s1.randomSeed);

                    // Interpolate Disc
                    _s0Pos.set(s0.disc.pos.x, s0.disc.pos.y, s0.disc.pos.z);
                    _s1Pos.set(s1.disc.pos.x, s1.disc.pos.y, s1.disc.pos.z);
                    disc.position.lerpVectors(_s0Pos, _s1Pos, t);

                    _s0Vel.set(s0.disc.vel.x, s0.disc.vel.y, s0.disc.vel.z);
                    _s1Vel.set(s1.disc.vel.x, s1.disc.vel.y, s1.disc.vel.z);
                    disc.velocity.lerpVectors(_s0Vel, _s1Vel, t);
                    
                    disc.state = s1.disc.state as any;

                    // Interpolate Players
                    for (const pState1 of s1.players) {
                        const pState0 = s0.players.find(p => p.id === pState1.id);
                        const player = allPlayers.find(p => p.id === pState1.id);
                        if (player && pState0) {
                            // Position
                            player.movement.position.x = THREE.MathUtils.lerp(pState0.pos.x, pState1.pos.x, t);
                            player.movement.position.z = THREE.MathUtils.lerp(pState0.pos.z, pState1.pos.z, t);
                            
                            // Facing (short-way angle lerp)
                            let diff = pState1.facing - pState0.facing;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            while (diff < -Math.PI) diff += Math.PI * 2;
                            player.movement.facing = pState0.facing + diff * t;

                            player.holdingDisc = pState1.holding;
                            player.setMarking(pState1.marking, pState1.markPct);
                            player.stickman.setAccent(pState1.accent);
                            
                            // Sync animation - we can lerp the normalized pose time
                            player.setRemotePose(pState1.anim, pState1.animTime);
                        }
                    }
                } else if (stateBuffer.length > 0) {
                    // Fallback: apply latest if we run out of buffer
                    const latest = stateBuffer[stateBuffer.length - 1];
                    match.score = latest.score;
                    match.phase = latest.phase as any;
                    disc.position.set(latest.disc.pos.x, latest.disc.pos.y, latest.disc.pos.z);
                    for (const ps of latest.players) {
                        const p = allPlayers.find(pl => pl.id === ps.id);
                        if (p) {
                            p.movement.position.set(ps.pos.x, 0, ps.pos.z);
                            p.movement.facing = ps.facing;
                            p.setRemotePose(ps.anim, ps.animTime);
                        }
                    }
                }
            }
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
            stadium.update(frameDt, excitement);
            musicSystem.setGameState({
                phase: match.phase,
                stallCount: match.point.stallCount,
                momentum: excitement,
                isCloseGame: scoreDiff <= 1 && maxScore >= 3,
            });
            musicSystem.update(frameDt);

            if (!lanSpectatorMode) {
                if (
                    match.phase !== prevPhase &&
                    match.phase === 'pre_pull' &&
                    match.pointsPlayed > 0
                ) {
                    if (currentMode === 'career_match' && careerManager) {
                        applyCareerLineupToHome(match.offenseTeam === 'home');
                    }
                    if (
                        !halftimeShown &&
                        maxScore >= halftimeAtScore &&
                        match.score[0] < match.getGameTo() &&
                        match.score[1] < match.getGameTo()
                    ) {
                        halftimeShown = true;
                        halftimePaused = true;
                        for (const slot of controllerSlots) {
                            slot.throwCtrl.reset();
                        }
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
                    const turnoverReason = match.point.turnoverReason;
                    const lastThrower = lastThrowerByTeam[prevOffenseTeam];
                    if (turnoverReason === 'stall') {
                        const holder = disc.holder;
                        const holderId =
                            holder && holder.team === prevOffenseTeam
                                ? holder.id
                                : lastThrower;
                        if (holderId) {
                            getPlayerLine(prevOffenseTeam, holderId).throwaways += 1;
                        }
                    } else if (
                        (turnoverReason === 'incomplete' ||
                            turnoverReason === 'out_of_bounds') &&
                        !dropTurnoverTeam[prevOffenseTeam]
                    ) {
                        if (lastThrower) {
                            getPlayerLine(prevOffenseTeam, lastThrower).throwaways += 1;
                        }
                    }
                    dropTurnoverTeam[prevOffenseTeam] = false;
                    delete lastCompletedPassByTeam[prevOffenseTeam];

                    if (match.point.turnoverReason === 'stall') {
                        stallTurnoversByTeam[prevOffenseTeam] += 1;
                    }
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
                    for (const slot of controllerSlots) {
                        if (!slot.active) continue;
                        const teamObj = slot.team === 'home' ? homeTeam : awayTeam;
                        
                        // Switch to nearest available player
                        let nearest: Player | null = null;
                        let nearestDist = Infinity;
                        for (const p of teamObj.players) {
                            const isOtherControlled = controllerSlots.some(s => s !== slot && s.switching.controlledPlayer === p);
                            if (isOtherControlled) continue;
                            
                            const d = p.movement.position.distanceTo(disc.position);
                            if (d < nearestDist) {
                                nearestDist = d;
                                nearest = p;
                            }
                        }
                        if (nearest) slot.switching.switchTo(nearest);
                        slot.throwCtrl.reset();
                    }
                    throwUI.hide();
                    trajectoryPreview.setVisible(false);
                }
                prevOffenseTeam = match.offenseTeam;
            }

            // Spirit system update
            if (!lanSpectatorMode) {
                spiritSystem.update(frameDt, match, allPlayers, disc);
            }
            hud.updateSpirit(spiritSystem.getPlayerTeamSpirit().total);

            // Broadcasting state from host
            if (lanClient && !lanSpectatorMode) {
                broadcastStateTimer += frameDt;
                if (broadcastStateTimer > 0.0166) { // 60Hz broadcast
                    broadcastStateTimer = 0;
                    lanClient.broadcastState({
                        timestamp: performance.now(),
                        disc: {
                            pos: { x: disc.position.x, y: disc.position.y, z: disc.position.z },
                            vel: { x: disc.velocity.x, y: disc.velocity.y, z: disc.velocity.z },
                            state: disc.state,
                        },
                        players: allPlayers.map(p => ({
                            id: p.id,
                            pos: { x: p.movement.position.x, z: p.movement.position.z },
                            facing: p.movement.facing,
                            anim: p.getAnimState(),
                            animTime: p.getAnimTimer(),
                            holding: p.holdingDisc,
                            marking: p.isMarking,
                            markPct: p.markStallIntensity,
                            accent: (p.stickman as any).accentMesh ? '#' + (p.stickman as any).accentMesh.material.color.getHex().toString(16).padStart(6, '0') : null,
                        })),
                        score: [...match.score] as [number, number],
                        stall: match.point.stallCount,
                        phase: match.phase,
                        offenseTeam: match.offenseTeam,
                        statusText: match.statusText,
                        statusTextActive: match.statusTextActive,
                        randomSeed: matchSeed,
                    });
                }

                metadataTimer += frameDt;
                if (metadataTimer > 2.0) { // 0.5Hz metadata
                    metadataTimer = 0;
                    lanClient.updateMetadata({
                        homeName: homeTeam.name,
                        awayName: awayTeam.name,
                        homeScore: match.score[0],
                        awayScore: match.score[1],
                        phase: match.phase,
                        joinable: multiplayerMode !== 'single'
                    });
                }
            }

            // Replay Snapshot Recording
            if (replayRecorder.recording()) {
                snapshotTimer += frameDt;
                if (snapshotTimer > 2.0) {
                    snapshotTimer = 0;
                    replayRecorder.recordSnapshot({
                        timestamp: performance.now(),
                        disc: {
                            pos: { x: disc.position.x, y: disc.position.y, z: disc.position.z },
                            vel: { x: disc.velocity.x, y: disc.velocity.y, z: disc.velocity.z },
                            state: disc.state,
                        },
                        players: allPlayers.map(p => ({
                            id: p.id,
                            pos: { x: p.movement.position.x, z: p.movement.position.z },
                            facing: p.movement.facing,
                            anim: p.getAnimState(),
                            animTime: p.getAnimTimer(),
                            holding: p.holdingDisc,
                            marking: p.isMarking,
                            markPct: p.markStallIntensity,
                            accent: (p.stickman as any).currentAccentColor || null,
                        })),
                        score: [...match.score] as [number, number],
                        stall: match.point.stallCount,
                        phase: match.phase,
                        offenseTeam: match.offenseTeam,
                        statusText: match.statusText,
                        statusTextActive: match.statusTextActive,
                        randomSeed: matchSeed,
                    });
                }
            }

            // Player foul calling
            if (!lanSpectatorMode) {
                for (const slot of controllerSlots) {
                    if (slot.active && slot.switching.controlledPlayer && slot.input.isCallingFoul()) {
                        const caller = slot.switching.controlledPlayer;
                        const opponentTeam = slot.team === 'home' ? awayTeam : homeTeam;
                        let nearestOpp: Player | null = null;
                        let nearestDist = Infinity;
                        for (const opp of opponentTeam.players) {
                            const d = opp.movement.position.distanceTo(caller.movement.position);
                            if (d < nearestDist) { nearestDist = d; nearestOpp = opp; }
                        }
                        spiritSystem.playerCallFoul(caller, nearestOpp);
                    }
                }
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
                stadium.triggerCheer();
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
                        scorer.team as TeamSide,
                    );
                    recordEvent(
                        'goal',
                        `${scorer.playerName} scores for ${scoringTeamName}`,
                        scorer.playerId,
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
                stadium.triggerCheer(3.0);
                vocalSynth.announceGameOver();
                vocalSynth.blowWhistle('triple');
                musicSystem.stop();
                replayRecorder.stop();
                try { saveReplay(replayRecorder.getData()); } catch (_) { /* storage full */ }
                const performerLines = buildPerformerLines();
                const progression = buildProgressionData(performerLines);
                const careerResult = buildCareerMatchResult(performerLines);
                const returnToCareerMenu = currentMode === 'career_match';
                if (careerResult && careerManager) {
                    const outcome = careerManager.processMatchResult(careerResult);
                    if (!outcome.ok) {
                        console.warn('Career result rejected:', outcome.reason);
                    }
                }
                const replayData = replayRecorder.getData();
                const highlights = extractHighlights(replayData);

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
                        progression,
                    },
                    () => {
                        stopGame();
                        menuSystem.setState(
                            returnToCareerMenu ? 'career_menu' : 'title',
                        );
                    },
                    highlights.length > 0 ? () => {
                        currentMode = 'highlights_reel';
                        highlightPlayer.play(replayData, highlights);
                    } : undefined
                );
            }

            if (matchEnded) {
                renderFrame(rawDt, frameDt);
                return;
            }
            const controlled = primarySlot.switching.controlledPlayer;
            hud.updateContext({
                phase: match.phase,
                hasDisc: !!controlled?.holdingDisc,
                isPlayerOnOffense: match.isTeamOnOffense(primarySlot.team),
                isPlayerPulling: match.isTeamPulling(primarySlot.team),
                quickReleaseAvailable: primarySlot.throwCtrl.isQuickRelease,
            });

            // Iterate over all slots for switching and actions
            if (!lanSpectatorMode) {
                for (const slot of controllerSlots) {
                    if (!slot.active) continue;

                    // Apply dynamic customization from network proxy
                    if (slot.input instanceof NetworkInputProxy) {
                        const accentColor = slot.input.getAccentColor();
                        if (accentColor && slot.switching.controlledPlayer) {
                            slot.switching.controlledPlayer.stickman.setAccent(accentColor);
                        }
                    } else if (slot === primarySlot && slot.switching.controlledPlayer) {
                        // Default accent for primary keyboard player
                        slot.switching.controlledPlayer.stickman.setAccent('#ffffff');
                    }

                    slot.switchCooldown = Math.max(0, slot.switchCooldown - frameDt);
                    if (slot.input.isSwitchPlayer() && slot.switchCooldown <= 0) {
                        const teamObj = slot.team === 'home' ? homeTeam : awayTeam;
                        
                        // Switch to next player not controlled by someone else
                        let nextIdx = teamObj.players.indexOf(slot.switching.controlledPlayer!) + 1;
                        for (let i = 0; i < teamObj.players.length; i++) {
                            const p = teamObj.players[(nextIdx + i) % teamObj.players.length];
                            const isOtherControlled = controllerSlots.some(s => s !== slot && s.switching.controlledPlayer === p);
                            if (!isOtherControlled) {
                                slot.switching.switchTo(p);
                                break;
                            }
                        }
                        
                        slot.switchCooldown = 0.3;
                        if (slot === primarySlot) onboarding?.check('catch_or_switch');
                    }
                }
            }

            // Pre-pull
            if (!lanSpectatorMode && match.phase === 'pre_pull' && match.pullReady) {
                let pullRequested = false;
                const pullingTeamHasHuman = controllerSlots.some(s => s.active && s.team === match.pullingTeam);
                
                for (const slot of controllerSlots) {
                    if (slot.active && slot.team === match.pullingTeam && (slot.input.isJumping() || slot.input.mouseButtons.left)) {
                        pullRequested = true;
                        break;
                    }
                }

                if (!broadcast.isPullLocked() && pullRequested) {
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
            }

            // Live play
            let primaryUiVisible = false;
            if (!lanSpectatorMode) {
                for (const slot of controllerSlots) {
                if (!slot.active) continue;
                const controlledPlayer = slot.switching.controlledPlayer;
                if (!controlledPlayer) continue;
                
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

                        // Only show UI for primary player or first player on team if splitscreen
                        const isPrimaryUI = (slot === primarySlot);
                        if (isPrimaryUI && slot.throwCtrl.charging) {
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
                                controlledPlayer.id,
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
                            if (isPrimaryUI) {
                                throwUI.hide();
                                trajectoryPreview.setVisible(false);
                            }
                            audio.playThrowSound(throwParams.speed, slot.throwCtrl.currentThrowType);
                            replayRecorder.recordThrow(
                                controlledPlayer.id,
                                controlledPlayer.team,
                                throwParams,
                            );
                            if (slot === primarySlot) {
                                tutorial?.checkCondition('disc_thrown');
                                onboarding?.check('throw');
                            }
                        }

                        controlledPlayer.update(frameDt, {
                            movementDir: rawMove,
                            sprint: false,
                        });
                        continue;
                    }

                    controlledPlayer.update(frameDt, {
                        movementDir: cameraMove,
                        sprint: slot.input.isSprinting(),
                    });
                    continue;
                }

                controlledPlayer.update(frameDt, {
                    movementDir: controlledPlayer.holdingDisc ? rawMove : cameraMove,
                    sprint: slot.input.isSprinting(),
                });
            }

            if (!primaryUiVisible) {
                throwUI.hide();
                trajectoryPreview.setVisible(false);
            }
        }

            // Tutorial condition checks
            const primaryControlled = primarySlot.switching.controlledPlayer;
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
                if (primaryControlled?.holdingDisc) {
                    tutorial.checkCondition('disc_picked_up');
                }
                if (homeScored || awayScored) {
                    tutorial.checkCondition('point_scored');
                    tutorial.checkCondition('tutorial_completed');
                }
            }
            if (onboarding?.isActive()) {
                const rawMove = primarySlot.input.getMovementDir();
                if (Math.abs(rawMove.x) > 0.1 || Math.abs(rawMove.z) > 0.1) {
                    onboarding.check('move');
                }
                if (
                    primarySlot.input.isSprinting() &&
                    (Math.abs(rawMove.x) > 0.1 || Math.abs(rawMove.z) > 0.1)
                ) {
                    onboarding.check('sprint');
                }
                if (homeScored || awayScored) {
                    onboarding.check('score');
                }
            }

            // Cut skid detection (controlled player sharp direction change)
            if (primaryControlled) {
                const vel = primaryControlled.movement.velocity;
                const speed = vel.length();
                if (speed > 4) {
                    const currentDir = vel.clone().normalize();
                    const dot = prevVelocityDir.dot(currentDir);
                    const now = performance.now() / 1000;
                    if (dot < -0.3 && now - lastCutTime > 0.3) {
                        audio.playCutSkid(1 - dot);
                        particles.emitGrassSpray(primaryControlled.movement.position);
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
                    effectiveWindSpeed, effectiveWindDir,
                );
                const awayThrow = awayAI.update(
                    frameDt, awayTeam, homeTeam, disc, !isHomeOffense,
                    match.attackingEndzone.away, match.point.stallCount,
                    effectiveWindSpeed, effectiveWindDir,
                );

                const homeThrower = disc.holder;
                if (homeThrow && disc.state === 'held' && homeThrower?.team === 'home') {
                    registerThrowAttempt(
                        'home',
                        homeThrower.id,
                        estimateThrowDistanceMeters(
                            homeThrow.speed,
                            homeThrow.direction.y,
                        ),
                    );
                    registerMomentum('home', 0.45);
                    homeThrower.startThrow(
                        homeThrow.isForehand ? 'forehand' : 'backhand',
                    );
                    disc.throwDisc(homeThrow, 'home');
                    audio.startDiscHum();
                    discTrail.setTeamColor(TEAM_A_PRIMARY);
                    audio.playThrowSound(homeThrow.speed, homeThrow.isForehand ? 'forehand' : 'backhand');
                }
                const awayThrower = disc.holder;
                if (awayThrow && disc.state === 'held' && awayThrower?.team === 'away') {
                    registerThrowAttempt(
                        'away',
                        awayThrower.id,
                        estimateThrowDistanceMeters(
                            awayThrow.speed,
                            awayThrow.direction.y,
                        ),
                    );
                    registerMomentum('away', 0.45);
                    awayThrower.startThrow(
                        awayThrow.isForehand ? 'forehand' : 'backhand',
                    );
                    disc.throwDisc(awayThrow, 'away');
                    audio.startDiscHum();
                    discTrail.setTeamColor(TEAM_B_PRIMARY);
                    audio.playThrowSound(awayThrow.speed, awayThrow.isForehand ? 'forehand' : 'backhand');
                }
            }

            // Debug visuals update
            if (debugVisuals.isVisible()) {
                debugVisuals.update(
                    homeAI.getDebugSnapshot(),
                    awayAI.getDebugSnapshot(),
                    [...homeTeam.players, ...awayTeam.players],
                );
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

            if (
                currentMode === 'career_match' &&
                (match.phase === 'live_play' || match.phase === 'pulling')
            ) {
                for (const player of homeTeam.players) {
                    if (!player.stats) continue;
                    getPlayerLine('home', player.id).playingTime += frameDt;
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
                    if (result.isContestedDrop) {
                        if (thrownBy && result.dropper && result.dropper.team === thrownBy) {
                            getPlayerLine(thrownBy, result.dropper.id).drops += 1;
                            dropTurnoverTeam[thrownBy] = true;
                            const dropperName =
                                result.dropper.stats?.fullName ??
                                `${result.dropper.role} #${result.dropper.index + 1}`;
                            recordEvent(
                                'turnover',
                                `${dropperName} drops the disc`,
                                result.dropper.id,
                            );
                        }
                        disc.state = 'on_ground';
                        disc.previousState = 'in_flight';
                        result.catcher.holdingDisc = false;
                        postFX.triggerSmallShake();
                        crowdAudio.reactToNearMiss();
                    } else {
                        disc.pickup(result.catcher);
                        // Face catcher toward their attacking endzone
                        const catcherEndzone = match.attackingEndzone[result.catcher.team];
                        result.catcher.movement.facing = catcherEndzone === 0 ? Math.PI : 0;
                        replayRecorder.recordCatch(
                            result.catcher.id,
                            result.catcher.team,
                            { x: disc.position.x, y: disc.position.y, z: disc.position.z },
                        );

                        // Tutorial condition: disc caught
                        tutorial?.checkCondition('disc_caught');
                        onboarding?.check('catch_or_switch');

                        if (wasInFlight && thrownBy && !result.isInterception) {
                            teamStats[thrownBy].completions += 1;
                            const throwerId = lastThrowerByTeam[thrownBy];
                            if (throwerId) {
                                getPlayerLine(thrownBy, throwerId).completions += 1;
                                lastCompletedPassByTeam[thrownBy] = {
                                    throwerId,
                                    receiverId: result.catcher.id,
                                };
                            }
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
                            addBlock(
                                result.catcher.id,
                                playerName,
                                teamName,
                                result.catcher.team,
                            );
                            recordEvent(
                                'block',
                                `${playerName} gets a block for ${teamName}`,
                                result.catcher.id,
                            );
                            crowdAudio.reactToBlock();
                            stadium.triggerCheer(0.5);
                            if (thrownBy) {
                                const turnoverThrower = lastThrowerByTeam[thrownBy];
                                if (turnoverThrower) {
                                    getPlayerLine(thrownBy, turnoverThrower).throwaways += 1;
                                }
                            }
                        }
                    }
                    
                    if (!result.isContestedDrop) {
                        // Trigger continuation mode for quick release
                        for (const slot of controllerSlots) {
                            if (slot.active && slot.switching.controlledPlayer === result.catcher) {
                                slot.throwCtrl.onCatch();
                            }
                        }
                        
                        if (!isSpectator && saveManager.getSettings().gameplay.autoSwitchOnCatch) {
                            // Find the best slot to take the disc if not already controlled
                            const alreadyControlled = controllerSlots.some(s => s.active && s.switching.controlledPlayer === result.catcher);
                            
                            if (!alreadyControlled) {
                                let bestSlot: ControllerSlot | null = null;
                                let minDist = Infinity;
                                for (const s of controllerSlots) {
                                    if (s.active && s.team === result.catcher.team) {
                                        const d = s.switching.controlledPlayer?.movement.position.distanceTo(result.catcher.movement.position) ?? Infinity;
                                        if (d < minDist) {
                                            minDist = d;
                                            bestSlot = s;
                                        }
                                    }
                                }
                                if (bestSlot) {
                                    bestSlot.switching.switchTo(result.catcher);
                                }
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
            const mDown = primarySlot.input.isKeyDown('KeyM');
            if (mDown && !minimapKeyLatch) {
                minimap.toggle();
            }
            minimapKeyLatch = mDown;
            minimap.update(
                allPlayers,
                disc,
                primarySlot.switching.controlledPlayer,
                gameCamera.camera,
            );
            if (debugVisuals.isVisible()) {
                minimap.drawDebug(
                    homeAI.getDebugSnapshot(),
                    awayAI.getDebugSnapshot(),
                    allPlayers,
                );
            }

            // Rain particles for weather
            if (weatherCondition === 'rain') {
                for (let i = 0; i < 3; i++) {
                    particles.emitRainDrop(FIELD_WIDTH, FIELD_LENGTH);
                }
            }

            // Wind dust from strong gusts
            if (effectiveWindSpeed > 5 && Random.next() < 0.3) {
                const dustOrigin = new THREE.Vector3(
                    (Random.next() - 0.5) * FIELD_WIDTH,
                    0.1,
                    Random.next() * FIELD_LENGTH,
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
            const width = window.innerWidth;
            const height = window.innerHeight;
            renderer.setSize(width, height);
            postFX.handleResize(width, height);
            discTrail.handleResize(width, height);
            updateViewports();
        };
        window.addEventListener('resize', resizeHandler);

        // Cleanup function
        gameInstance = {
            cleanup: () => {
                window.removeEventListener('resize', resizeHandler);
                window.removeEventListener('click', startAudio);
                window.removeEventListener('keydown', startAudio);
                for (const slot of controllerSlots) {
                    if ('destroy' in slot.input) (slot.input as any).destroy();
                }
                lanClient?.destroy();
                lanStatusBadge?.remove();
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
                onboarding?.destroy();
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
                debugVisuals.dispose();
            }
        };
    }
}

main();
