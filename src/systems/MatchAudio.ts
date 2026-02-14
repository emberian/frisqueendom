import type { EventBus } from '../core/EventBus';
import type { AudioEngine } from '../audio/AudioEngine';
import type { CrowdAudio } from '../audio/CrowdAudio';
import type { VocalSynth } from '../audio/VocalSynth';
import type { Stadium } from '../rendering/Stadium';
import type { PostFX } from '../rendering/PostFX';

/**
 * MatchAudio subscribes to EventBus events and triggers appropriate
 * audio/visual reactions.
 *
 * This system replaces the scattered audio calls throughout the game loop
 * by centralizing them as event-driven reactions.
 *
 * Usage:
 *   const matchAudio = new MatchAudio(eventBus, { audio, crowdAudio, vocalSynth, stadium, postFX });
 *   // ... later, during cleanup:
 *   matchAudio.destroy();
 */
export class MatchAudio {
    private unsubscribers: Array<() => void> = [];

    constructor(
        events: EventBus,
        deps: {
            audio: AudioEngine;
            crowdAudio: CrowdAudio;
            vocalSynth: VocalSynth;
            stadium: Stadium;
            postFX: PostFX;
        },
    ) {
        const { audio, crowdAudio, vocalSynth, stadium, postFX } = deps;

        // ── Score ──
        this.unsubscribers.push(
            events.on('score', () => {
                postFX.triggerScoreEffect();
                audio.playScoreJingle();
                audio.stopDiscHum();
                setTimeout(() => audio.playDiscSpike(), 300);
                setTimeout(() => audio.playTeamCheer(), 500);
                crowdAudio.reactToScore();
                stadium.triggerCheer();
                vocalSynth.announceScore();
            }),
        );

        // ── Turnover ──
        this.unsubscribers.push(
            events.on('turnover', () => {
                crowdAudio.reactToNearMiss();
                vocalSynth.announceTurnover();
                vocalSynth.blowWhistle('short');
                postFX.triggerBlockShake();
                audio.stopDiscHum();
            }),
        );

        // ── Phase Change ──
        this.unsubscribers.push(
            events.on('phase_change', (payload) => {
                // Halftime-related audio is handled by the halftime logic in main.ts,
                // but we can react to specific transitions here if needed.
                if (payload.to === 'score') {
                    // Score phase entered — could layer additional audio
                }
            }),
        );

        // ── Match End ──
        this.unsubscribers.push(
            events.on('match_end', () => {
                crowdAudio.reactToScore();
                stadium.triggerCheer(3.0);
                vocalSynth.announceGameOver();
                vocalSynth.blowWhistle('triple');
            }),
        );

        // ── Block (interception) ──
        this.unsubscribers.push(
            events.on('disc_block', () => {
                audio.playBlockSound();
                crowdAudio.reactToBlock();
                stadium.triggerCheer(0.5);
                postFX.triggerBlockShake();
            }),
        );

        // ── Stall ──
        this.unsubscribers.push(
            events.on('disc_stall', () => {
                vocalSynth.blowWhistle('short');
            }),
        );
    }

    /**
     * Unsubscribe from all events. Call during cleanup.
     */
    destroy(): void {
        for (const unsub of this.unsubscribers) {
            unsub();
        }
        this.unsubscribers.length = 0;
    }
}
