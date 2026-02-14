import type { GameSettings } from '../../data/SaveLoad';

export type MenuState =
    | 'title'
    | 'career_menu'
    | 'match_setup'
    | 'settings'
    | 'credits'
    | 'practice_menu'
    | 'locker'
    | 'challenge'
    | 'replay_browser'
    | 'paused'
    | 'none';

export type MultiplayerMode = 'single' | 'local_split' | 'lan_remote' | 'lan_spectator';

export interface QuickMatchConfig {
    color: string;
    difficulty: string;
    gameTo: number;
    multiplayerMode: MultiplayerMode;
    spectatorMode?: boolean;
    lanServerUrl?: string;
    lanRoom?: string;
    timeOfDay?: string;
    weather?: string;
    randomSeed?: number;
}

export interface MatchSetupConfig {
    scoreTarget: number;
    winByTwo: boolean;
    pointCap: number;
    timeOfDay: string;
    venue: string;
    wind: string;
}

export interface ScreenContext {
    navigate: (path: string, params?: Record<string, string>) => void;
    setState: (state: MenuState) => void;
    getSettings: () => GameSettings;
    getTempSettings: () => GameSettings;
    setTempSettings: (settings: GameSettings) => void;
    saveSettings: (settings: GameSettings) => void;
    applyMenuAccessibility: (settings: GameSettings) => void;
    rerender: () => void;
}

export interface Screen {
    render(container: HTMLElement): void;
    destroy(): void;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function cloneSettings(settings: GameSettings): GameSettings {
    return JSON.parse(JSON.stringify(settings)) as GameSettings;
}
