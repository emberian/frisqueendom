import { ReplayPlayer } from './ReplayPlayer';
import { type Highlight, type ReplayData } from './Replay';

export interface HighlightReelOptions {
    onClipStart?: (highlight: Highlight) => void;
    onReelEnd?: () => void;
}

/**
 * HighlightReelPlayer manages a sequence of replay clips
 */
export class HighlightReelPlayer {
    private replayPlayer: ReplayPlayer;
    private highlights: Highlight[] = [];
    private currentClipIndex = -1;
    private options: HighlightReelOptions;
    private clipTimer = 0;

    constructor(replayPlayer: ReplayPlayer, options: HighlightReelOptions = {}) {
        this.replayPlayer = replayPlayer;
        this.options = options;
    }

    /**
     * Start playing a sequence of highlights
     */
    play(data: ReplayData, highlights: Highlight[]): void {
        this.highlights = highlights;
        this.replayPlayer.load(data);
        this.currentClipIndex = -1;
        this.playNextClip();
    }

    private playNextClip(): void {
        this.currentClipIndex++;
        if (this.currentClipIndex >= this.highlights.length) {
            this.options.onReelEnd?.();
            return;
        }

        const clip = this.highlights[this.currentClipIndex];
        this.replayPlayer.seek(clip.startTime);
        this.replayPlayer.resume();
        this.clipTimer = clip.endTime - clip.startTime;
        this.options.onClipStart?.(clip);
    }

    /**
     * Update the reel playback
     */
    update(dt: number): void {
        if (this.currentClipIndex < 0 || this.currentClipIndex >= this.highlights.length) return;

        this.replayPlayer.update(dt);
        this.clipTimer -= dt * this.replayPlayer.getSpeed();

        if (this.clipTimer <= 0) {
            this.playNextClip();
        }
    }

    /**
     * Skip to next clip
     */
    skip(): void {
        this.playNextClip();
    }

    getCurrentHighlight(): Highlight | null {
        return this.highlights[this.currentClipIndex] || null;
    }
}
