import type { GameSettings } from '../data/SaveLoad';
import type { RoomMetadata } from '../network/protocol';
import {
    cloneSettings,
    type MenuState,
    type QuickMatchConfig,
    type Screen,
    type ScreenContext,
} from './screens/ScreenInterface';
import { TitleScreen } from './screens/TitleScreen';
import { CareerScreen } from './screens/CareerScreen';
import { MatchSetupScreen } from './screens/MatchSetupScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { CreditsScreen } from './screens/CreditsScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { LockerScreen } from './screens/LockerScreen';
import { PauseScreen } from './screens/PauseScreen';

export type { MenuState, QuickMatchConfig };
export type { Screen };

/**
 * ScreenManager is the thin router that maps MenuState to screen instances.
 *
 * It provides a ScreenContext to each screen so they can navigate, access
 * settings, and trigger re-renders without knowing about each other.
 */
export class ScreenManager {
    private container: HTMLElement;
    private currentState: MenuState = 'title';
    private previousState: MenuState = 'title';
    private onStateChange?: (state: MenuState) => void;
    private navigateFn?: (path: string, params?: Record<string, string>) => void;
    private settings: GameSettings;
    private tempSettings: GameSettings;

    // Lazily-created screens
    private titleScreen: TitleScreen | null = null;
    private careerScreen: CareerScreen | null = null;
    private matchSetupScreen: MatchSetupScreen | null = null;
    private settingsScreen: SettingsScreen | null = null;
    private creditsScreen: CreditsScreen | null = null;
    private practiceScreen: PracticeScreen | null = null;
    private lockerScreen: LockerScreen | null = null;
    private pauseScreen: PauseScreen | null = null;

    private pauseCallbacks: { onResume: () => void; onQuit: () => void } | null = null;

    private ctx: ScreenContext;

    constructor(
        container: HTMLElement,
        settings: GameSettings,
        onStateChange?: (state: MenuState) => void,
        navigate?: (path: string, params?: Record<string, string>) => void,
    ) {
        this.container = container;
        this.settings = settings;
        this.tempSettings = cloneSettings(settings);
        this.onStateChange = onStateChange;
        this.navigateFn = navigate;

        this.ctx = {
            navigate: (path: string, params?: Record<string, string>) => {
                if (this.navigateFn) {
                    this.navigateFn(path, params);
                } else {
                    // Fallback: map path to state
                    const stateMap: Record<string, MenuState> = {
                        '/title': 'title',
                        '/career': 'career_menu',
                        '/setup': 'match_setup',
                        '/settings': 'settings',
                        '/credits': 'credits',
                        '/practice': 'practice_menu',
                        '/locker': 'locker',
                    };
                    const mapped = stateMap[path];
                    if (mapped) {
                        this.setState(mapped);
                    } else if (path === '/play') {
                        // Quick match: dispatch event and hide
                        this.setState('none');
                        const detail: QuickMatchConfig = {
                            color: params?.color || 'blue',
                            difficulty: params?.difficulty || 'normal',
                            gameTo: Number(params?.gameTo) || 15,
                            multiplayerMode: (params?.multiplayer || 'single') as QuickMatchConfig['multiplayerMode'],
                            timeOfDay: params?.time,
                            weather: params?.weather,
                        };
                        if (params?.relay) detail.lanServerUrl = params.relay;
                        if (params?.room) detail.lanRoom = params.room;
                        window.dispatchEvent(new CustomEvent('startQuickMatch', { detail }));
                    } else if (path === '/watch') {
                        this.setState('none');
                        const detail: QuickMatchConfig = {
                            color: params?.color || 'blue',
                            difficulty: params?.difficulty || 'normal',
                            gameTo: Number(params?.gameTo) || 15,
                            multiplayerMode: 'single',
                            spectatorMode: true,
                            timeOfDay: params?.time,
                            weather: params?.weather,
                        };
                        window.dispatchEvent(new CustomEvent('startSpectatorMatch', { detail }));
                    } else if (path === '/tutorial') {
                        this.setState('none');
                        window.dispatchEvent(new CustomEvent('startTutorial'));
                    } else if (path === '/drill') {
                        this.setState('none');
                        window.dispatchEvent(new CustomEvent('startPracticeDrill', {
                            detail: { drillType: params?.type },
                        }));
                    }
                }
            },
            setState: (state: MenuState) => this.setState(state),
            getSettings: () => this.settings,
            getTempSettings: () => this.tempSettings,
            setTempSettings: (s: GameSettings) => { this.tempSettings = s; },
            saveSettings: (s: GameSettings) => {
                this.settings = cloneSettings(s);
                this.tempSettings = cloneSettings(s);
                this.returnToPreviousState();
            },
            applyMenuAccessibility: (s: GameSettings) => this.applyMenuAccessibility(s),
            rerender: () => this.render(),
        };
    }

    private applyMenuAccessibility(settings: GameSettings): void {
        const scale = Math.max(1, Math.min(2, settings.accessibility.uiScale || 1.3));
        this.container.style.setProperty('--menu-ui-scale', scale.toFixed(3));
    }

    private getActiveMenuSettings(): GameSettings {
        return this.currentState === 'settings' ? this.tempSettings : this.settings;
    }

    private returnToPreviousState(): void {
        if (this.previousState === 'none' && this.pauseCallbacks) {
            this.setState('paused');
        } else {
            this.setState(this.previousState);
        }
    }

    // ---- Public API (mirrors MenuSystem) ----

    getState(): MenuState {
        return this.currentState;
    }

    setState(state: MenuState): void {
        if (state === 'none') {
            this.container.style.display = 'none';
        } else {
            this.container.style.display = 'flex';
        }

        if (state !== 'settings' && state !== 'paused') {
            this.previousState = this.currentState;
        }

        this.currentState = state;
        this.render();
        this.onStateChange?.(state);
    }

    render(): void {
        this.container.innerHTML = '';
        this.container.className = 'menu-container';
        this.applyMenuAccessibility(this.getActiveMenuSettings());

        const screen = this.getScreenForState(this.currentState);
        screen?.render(this.container);
    }

    private getScreenForState(state: MenuState): Screen | null {
        switch (state) {
            case 'title':
                if (!this.titleScreen) this.titleScreen = new TitleScreen(this.ctx);
                return this.titleScreen;
            case 'career_menu':
                if (!this.careerScreen) this.careerScreen = new CareerScreen(this.ctx);
                return this.careerScreen;
            case 'match_setup':
                if (!this.matchSetupScreen) this.matchSetupScreen = new MatchSetupScreen(this.ctx);
                return this.matchSetupScreen;
            case 'settings':
                if (!this.settingsScreen) this.settingsScreen = new SettingsScreen(this.ctx);
                return this.settingsScreen;
            case 'credits':
                if (!this.creditsScreen) this.creditsScreen = new CreditsScreen(this.ctx);
                return this.creditsScreen;
            case 'practice_menu':
                if (!this.practiceScreen) this.practiceScreen = new PracticeScreen(this.ctx);
                return this.practiceScreen;
            case 'locker':
                if (!this.lockerScreen) this.lockerScreen = new LockerScreen(this.ctx);
                return this.lockerScreen;
            case 'paused': {
                const resume = this.pauseCallbacks?.onResume || (() => {});
                const quit = this.pauseCallbacks?.onQuit || (() => {});
                if (!this.pauseScreen) {
                    this.pauseScreen = new PauseScreen(this.ctx, resume, quit);
                } else {
                    this.pauseScreen.setCallbacks(resume, quit);
                }
                return this.pauseScreen;
            }
            case 'none':
                return null;
        }
    }

    // --- Methods that proxy to specific screens ---

    updateLobby(rooms: RoomMetadata[]): void {
        if (this.titleScreen) {
            this.titleScreen.updateLobby(rooms);
        }
    }

    setMatchSetupDefaults(config: Partial<QuickMatchConfig>): void {
        if (this.currentState !== 'match_setup') return;
        if (this.matchSetupScreen) {
            this.matchSetupScreen.setDefaults(config);
        }
    }

    showPauseMenu(onResume: () => void, onQuit: () => void): void {
        this.pauseCallbacks = { onResume, onQuit };
        this.setState('paused');
    }

    getSettings(): GameSettings {
        return this.settings;
    }

    hide(): void {
        this.container.style.display = 'none';
    }

    show(): void {
        this.container.style.display = 'flex';
    }
}
