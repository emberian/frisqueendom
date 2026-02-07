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
import { TeamAI } from './ai/TeamAI';
import { HUD } from './ui/HUD';
import { ThrowUI } from './ui/ThrowUI';
import { AudioEngine } from './audio/AudioEngine';
import {
    PHYSICS_DT,
    STALL_DURATION,
    TEAM_A_PRIMARY,
    TEAM_A_SECONDARY,
    TEAM_B_PRIMARY,
    TEAM_B_SECONDARY,
} from './data/Constants';

async function main() {
    await init(wasmUrl);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);

    // Scene
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

    // Sky
    createSky(scene);

    // Field
    scene.add(createField());

    // Grass
    const grass = new GrassField(scene);

    // Teams
    const homeTeam = Team.create('Blue', TEAM_A_PRIMARY, TEAM_A_SECONDARY, 'home', scene);
    const awayTeam = Team.create('Red', TEAM_B_PRIMARY, TEAM_B_SECONDARY, 'away', scene);
    const allPlayers = [...homeTeam.players, ...awayTeam.players];

    // Disc
    const discSim = new DiscSimulator();
    const windSpeed = 3.0;
    const windDir = 1.57;
    discSim.set_base_wind(windSpeed, windDir);
    const disc = new Disc(discSim, scene);

    // Trail, Preview, Particles
    const discTrail = new DiscTrail(scene);
    const trajectoryPreview = new TrajectoryPreview(scene);
    const particles = new ParticleSystem(scene);

    // Post-processing
    const postFX = new PostFX();

    // Audio
    const audio = new AudioEngine();
    let audioStarted = false;

    // Input
    const input = new InputManager();
    const throwCtrl = new ThrowController();
    const switching = new PlayerSwitching();

    // AI
    const homeAI = new TeamAI();
    const awayAI = new TeamAI();

    // Match state
    const match = new Match();
    match.playerTeam = 'home';

    // UI
    const hud = new HUD();
    const throwUI = new ThrowUI();
    hud.updateScore(0, 0);
    hud.updateWind(windSpeed, windDir);

    // Start by giving player control of first home player
    switching.switchTo(homeTeam.players[0]);

    // Debug: expose game objects for console testing
    (window as any).__game = { match, disc, homeTeam, awayTeam, input, discSim };

    // Register test suite (lazy import, only loaded when called)
    (window as any).__tests = {
        discPhysics: () => import('./tests/disc-physics.test').then(m => m.runAll()),
    };

    // Follow target for camera
    const followTarget = new THREE.Vector3(0, 0, 50);
    let physicsAccumulator = 0;
    let trailTimer = 0;
    let switchCooldown = 0;
    let prevScore = [0, 0];

    // Start audio on first interaction
    const startAudio = () => {
        if (!audioStarted) {
            audioStarted = true;
            audio.startAmbientWind(windSpeed);
        }
    };
    window.addEventListener('click', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });

    // Game loop
    let lastTime = performance.now();

    function loop(now: number) {
        const rawDt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        const frameDt = rawDt * postFX.timeScale;

        // Update wind time
        discSim.update_wind(frameDt);

        // --- Match state machine ---
        match.update(frameDt, homeTeam, awayTeam, disc);
        hud.updatePhase(match.phase);
        hud.updateScore(match.score[0], match.score[1]);
        hud.showStateText(match.statusText, match.statusTextActive);

        // Score celebration
        if (
            match.score[0] !== prevScore[0] ||
            match.score[1] !== prevScore[1]
        ) {
            prevScore = [...match.score];
            postFX.triggerScoreEffect();
            particles.emitScoreCelebration(disc.position);
            audio.playScoreJingle();
            homeAI.resetForPoint();
            awayAI.resetForPoint();
        }

        // --- Handle phase-specific logic ---
        const controlled = switching.controlledPlayer;

        // Player switch cooldown
        switchCooldown = Math.max(0, switchCooldown - frameDt);
        if (input.isSwitchPlayer() && switchCooldown <= 0) {
            const myTeam = match.playerTeam === 'home' ? homeTeam : awayTeam;
            switching.switchToNext(myTeam);
            switchCooldown = 0.3;
        }

        // Pre-pull: space or click to pull
        if (match.phase === 'pre_pull' && match.pullReady) {
            if (input.isJumping() || input.mouseButtons.left) {
                match.executePull(disc, homeTeam, awayTeam);
                audio.playThrowWhoosh(25);
            }
        }

        // Live play: handle player input
        if (match.phase === 'live_play' && controlled) {
            if (controlled.holdingDisc) {
                const throwParams = throwCtrl.update(
                    frameDt,
                    input,
                    controlled,
                    camera,
                );

                if (throwCtrl.charging) {
                    throwUI.show(
                        throwCtrl.power,
                        throwCtrl.hyzer,
                        throwCtrl.forehand,
                    );

                    // Set up disc simulator for prediction
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
                } else {
                    throwUI.hide();
                    trajectoryPreview.setVisible(false);
                }

                if (throwParams) {
                    disc.throwDisc(throwParams, match.playerTeam);
                    throwCtrl.reset();
                    throwUI.hide();
                    trajectoryPreview.setVisible(false);
                    audio.playThrowWhoosh(throwParams.speed);
                }

                controlled.update(frameDt, {
                    movementDir: input.getMovementDir(),
                    sprint: false,
                });
            } else {
                controlled.update(frameDt, {
                    movementDir: input.getMovementDir(),
                    sprint: input.isSprinting(),
                });
            }
        } else if (controlled && match.phase !== 'live_play') {
            controlled.update(frameDt, {
                movementDir: input.getMovementDir(),
                sprint: input.isSprinting(),
            });
        }

        // --- AI updates ---
        const isHomeOffense = match.offenseTeam === 'home';

        if (match.phase === 'live_play' || match.phase === 'pulling') {
            const homeThrow = homeAI.update(
                frameDt,
                homeTeam,
                awayTeam,
                disc,
                isHomeOffense,
                match.attackingEndzone.home,
                match.point.stallCount,
            );
            const awayThrow = awayAI.update(
                frameDt,
                awayTeam,
                homeTeam,
                disc,
                !isHomeOffense,
                match.attackingEndzone.away,
                match.point.stallCount,
            );

            if (homeThrow && disc.state === 'held' && disc.holder?.team === 'home') {
                disc.throwDisc(homeThrow, 'home');
                audio.playThrowWhoosh(homeThrow.speed);
            }
            if (awayThrow && disc.state === 'held' && disc.holder?.team === 'away') {
                disc.throwDisc(awayThrow, 'away');
                audio.playThrowWhoosh(awayThrow.speed);
            }
        }

        // Update non-controlled players during phases where AI doesn't run
        for (const p of allPlayers) {
            if (!p.isControlled && match.phase !== 'live_play' && match.phase !== 'pulling') {
                p.update(frameDt, null);
            }
        }

        // --- Physics ---
        if (disc.state === 'in_flight') {
            physicsAccumulator += frameDt;
            while (physicsAccumulator >= PHYSICS_DT) {
                disc.bridge.step(PHYSICS_DT);
                physicsAccumulator -= PHYSICS_DT;
                if (disc.bridge.isGrounded()) {
                    break;
                }
            }
        }

        disc.update(frameDt);

        // --- Catch detection ---
        if (disc.state === 'in_flight' || disc.state === 'on_ground') {
            const result = checkCatch(disc, allPlayers);
            if (result) {
                disc.pickup(result.catcher);
                const myTeam =
                    match.playerTeam === 'home' ? homeTeam : awayTeam;
                switching.autoSwitchOnCatch(result.catcher, myTeam);
                audio.playCatchClap();
                particles.emitCatchBurst(
                    disc.position,
                    result.catcher.team === 'home' ? TEAM_A_PRIMARY : TEAM_B_PRIMARY,
                );
            }
        }

        // --- Stall HUD ---
        hud.updateStall(
            match.point.stallCount,
            STALL_DURATION,
            disc.state === 'held' && match.phase === 'live_play',
        );

        // --- Trail ---
        if (disc.state === 'in_flight') {
            trailTimer += frameDt;
            if (trailTimer > 0.016) {
                discTrail.push(disc.position);
                trailTimer = 0;
            }
        } else {
            discTrail.clear();
        }

        // --- Grass & Particles ---
        grass.update(frameDt, windSpeed, windDir);
        particles.update(frameDt);

        // --- Camera ---
        if (disc.state === 'in_flight') {
            followTarget.copy(disc.position);
            gameCamera.setMode('follow_disc');
        } else if (controlled) {
            followTarget.copy(controlled.movement.position);
            gameCamera.setMode('follow_player');
        }
        gameCamera.update(frameDt, followTarget);

        // Post effects (applies shake to camera)
        postFX.update(rawDt, camera);

        // --- Render ---
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);

    // Resize
    window.addEventListener('resize', () => {
        gameCamera.handleResize();
        renderer.setSize(window.innerWidth, window.innerHeight);
        for (const p of allPlayers) {
            p.stickman.updateResolution(window.innerWidth, window.innerHeight);
        }
    });
}

main();
