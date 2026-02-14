// Quality Settings System — controls rendering quality presets and performance monitoring

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
    // Rendering
    shadowMapSize: number;
    shadowsEnabled: boolean;
    pixelRatio: number;

    // Post-processing
    bloomEnabled: boolean;
    godRaysEnabled: boolean;
    motionBlurEnabled: boolean;
    depthOfFieldEnabled: boolean;
    chromaticAberration: boolean;
    filmGrain: boolean;

    // Environment
    grassDensity: number;
    cloudCount: number;
    particleMultiplier: number;

    // Misc
    antialias: boolean;
}

const PRESETS: Record<QualityLevel, QualityPreset> = {
    low: {
        shadowMapSize: 0,
        shadowsEnabled: false,
        pixelRatio: 0.75,
        bloomEnabled: false,
        godRaysEnabled: false,
        motionBlurEnabled: false,
        depthOfFieldEnabled: false,
        chromaticAberration: false,
        filmGrain: false,
        grassDensity: 5000,
        cloudCount: 50,
        particleMultiplier: 0.25,
        antialias: false,
    },
    medium: {
        shadowMapSize: 1024,
        shadowsEnabled: true,
        pixelRatio: 1.0,
        bloomEnabled: true,
        godRaysEnabled: false,
        motionBlurEnabled: false,
        depthOfFieldEnabled: false,
        chromaticAberration: false,
        filmGrain: false,
        grassDensity: 20000,
        cloudCount: 250,
        particleMultiplier: 0.6,
        antialias: true,
    },
    high: {
        shadowMapSize: 2048,
        shadowsEnabled: true,
        pixelRatio: 1.0,
        bloomEnabled: true,
        godRaysEnabled: true,
        motionBlurEnabled: true,
        depthOfFieldEnabled: true,
        chromaticAberration: true,
        filmGrain: true,
        grassDensity: 40000,
        cloudCount: 400,
        particleMultiplier: 1.0,
        antialias: true,
    },
};

export function getQualityPreset(level: QualityLevel): QualityPreset {
    return { ...PRESETS[level] };
}

/** Detect optimal quality based on hardware capabilities. */
export function detectOptimalQuality(): QualityLevel {
    const cores = navigator.hardwareConcurrency ?? 4;

    // Try to get GPU info from WebGL
    let gpuTier: 'low' | 'mid' | 'high' = 'mid';
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        if (gl) {
            const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugExt) {
                const renderer = gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL).toLowerCase();
                // Detect low-end GPUs
                if (
                    renderer.includes('intel') ||
                    renderer.includes('mesa') ||
                    renderer.includes('swiftshader') ||
                    renderer.includes('llvmpipe')
                ) {
                    gpuTier = 'low';
                }
                // Detect high-end GPUs
                if (
                    renderer.includes('rtx') ||
                    renderer.includes('radeon rx 7') ||
                    renderer.includes('radeon rx 6') ||
                    renderer.includes('m1') ||
                    renderer.includes('m2') ||
                    renderer.includes('m3') ||
                    renderer.includes('m4') ||
                    renderer.includes('apple gpu')
                ) {
                    gpuTier = 'high';
                }
            }
        }
        canvas.remove();
    } catch {
        // WebGL detection failed, keep default
    }

    // Mobile detection
    const isMobile =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 2);

    if (isMobile || gpuTier === 'low' || cores <= 2) return 'low';
    if (gpuTier === 'high' && cores >= 8) return 'high';
    return 'medium';
}

const STORAGE_KEY = 'frisqueendom_quality';

export function loadQualityLevel(): QualityLevel | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'low' || stored === 'medium' || stored === 'high') return stored;
    return null;
}

export function saveQualityLevel(level: QualityLevel): void {
    localStorage.setItem(STORAGE_KEY, level);
}

// ---------------------------------------------------------------------------
// Performance Monitor
// ---------------------------------------------------------------------------

export class PerformanceMonitor {
    private frameTimes: number[] = [];
    private readonly sampleSize = 180; // ~3 seconds at 60fps
    private readonly downgradeThreshold = 33.3; // <30fps
    private readonly upgradeThreshold = 14.0; // >70fps sustained
    private currentLevel: QualityLevel;
    private lastChangeTime = 0;
    private readonly cooldownMs = 10_000; // wait 10s between changes
    onQualityChange?: (newLevel: QualityLevel) => void;

    constructor(initialLevel: QualityLevel) {
        this.currentLevel = initialLevel;
    }

    get level(): QualityLevel {
        return this.currentLevel;
    }

    /** Call once per frame with the frame's delta time in ms. */
    recordFrame(deltaMs: number): void {
        this.frameTimes.push(deltaMs);
        if (this.frameTimes.length > this.sampleSize) {
            this.frameTimes.shift();
        }

        if (this.frameTimes.length < this.sampleSize) return;

        const now = performance.now();
        if (now - this.lastChangeTime < this.cooldownMs) return;

        const avg =
            this.frameTimes.reduce((sum, t) => sum + t, 0) / this.frameTimes.length;

        if (avg > this.downgradeThreshold && this.currentLevel !== 'low') {
            const next: QualityLevel = this.currentLevel === 'high' ? 'medium' : 'low';
            this.currentLevel = next;
            this.lastChangeTime = now;
            this.frameTimes.length = 0;
            this.onQualityChange?.(next);
        } else if (avg < this.upgradeThreshold && this.currentLevel !== 'high') {
            const next: QualityLevel = this.currentLevel === 'low' ? 'medium' : 'high';
            this.currentLevel = next;
            this.lastChangeTime = now;
            this.frameTimes.length = 0;
            this.onQualityChange?.(next);
        }
    }

    /** Get current FPS estimate. */
    get fps(): number {
        if (this.frameTimes.length === 0) return 60;
        const avg =
            this.frameTimes.reduce((sum, t) => sum + t, 0) / this.frameTimes.length;
        return Math.round(1000 / avg);
    }
}
