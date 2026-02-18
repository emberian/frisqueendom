/**
 * Menus.ts -- Thin delegation wrapper.
 *
 * The actual screen logic lives in src/ui/screens/*.ts and is orchestrated
 * by ScreenManager.  This file re-exports the public types and the
 * MenuSystem class so that main.ts (and any other consumer) continues to
 * work without any import changes.
 */

import { saveManager } from '../data/SaveLoad';
import type { RoomMetadata } from '../network/protocol';
import { ScreenManager } from './ScreenManager';

// Re-export types that main.ts and others import from this module
export type {
    MenuState,
    QuickMatchConfig,
    MultiplayerMode,
    MatchSetupConfig,
} from './screens/ScreenInterface';

export type { Screen } from './screens/ScreenInterface';

export { getMatchSetupConfig, getSelectedOffenseFormation, getSelectedDefenseFormation } from './screens/MatchSetupScreen';

// ---------------------------------------------------------------------------
// Scene Transition Helpers  (kept here -- they are module-level utilities)
// ---------------------------------------------------------------------------

let _transitionOverlay: HTMLDivElement | null = null;

function ensureTransitionOverlay(): HTMLDivElement {
    if (_transitionOverlay && _transitionOverlay.parentElement) {
        return _transitionOverlay;
    }
    const overlay = document.createElement('div');
    overlay.style.cssText =
        'position:fixed;inset:0;z-index:9999;pointer-events:none;background:#000;opacity:0;' +
        'transition:none;';
    document.body.appendChild(overlay);
    _transitionOverlay = overlay;
    return overlay;
}

export function fadeToBlack(duration: number): Promise<void> {
    return new Promise((resolve) => {
        const overlay = ensureTransitionOverlay();
        overlay.style.transition = 'none';
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'auto';
        void overlay.offsetHeight;
        overlay.style.transition = `opacity ${duration}ms ease`;
        overlay.style.opacity = '1';
        const onEnd = () => {
            overlay.removeEventListener('transitionend', onEnd);
            resolve();
        };
        overlay.addEventListener('transitionend', onEnd);
        setTimeout(() => {
            overlay.removeEventListener('transitionend', onEnd);
            resolve();
        }, duration + 50);
    });
}

export function fadeFromBlack(duration: number): Promise<void> {
    return new Promise((resolve) => {
        const overlay = ensureTransitionOverlay();
        overlay.style.transition = 'none';
        overlay.style.opacity = '1';
        void overlay.offsetHeight;
        overlay.style.transition = `opacity ${duration}ms ease`;
        overlay.style.opacity = '0';
        const onEnd = () => {
            overlay.removeEventListener('transitionend', onEnd);
            overlay.style.pointerEvents = 'none';
            resolve();
        };
        overlay.addEventListener('transitionend', onEnd);
        setTimeout(() => {
            overlay.removeEventListener('transitionend', onEnd);
            overlay.style.pointerEvents = 'none';
            resolve();
        }, duration + 50);
    });
}

export function slideOverlay(direction: 'in' | 'out', duration: number): Promise<void> {
    return new Promise((resolve) => {
        const overlay = ensureTransitionOverlay();
        if (direction === 'in') {
            overlay.style.transition = 'none';
            overlay.style.opacity = '1';
            overlay.style.transform = 'translateY(-100%)';
            overlay.style.pointerEvents = 'auto';
            void overlay.offsetHeight;
            overlay.style.transition = `transform ${duration}ms ease`;
            overlay.style.transform = 'translateY(0)';
        } else {
            overlay.style.transition = 'none';
            overlay.style.opacity = '1';
            overlay.style.transform = 'translateY(0)';
            void overlay.offsetHeight;
            overlay.style.transition = `transform ${duration}ms ease`;
            overlay.style.transform = 'translateY(-100%)';
        }
        const onEnd = () => {
            overlay.removeEventListener('transitionend', onEnd);
            if (direction === 'out') {
                overlay.style.pointerEvents = 'none';
                overlay.style.opacity = '0';
                overlay.style.transform = '';
            }
            resolve();
        };
        overlay.addEventListener('transitionend', onEnd);
        setTimeout(() => {
            overlay.removeEventListener('transitionend', onEnd);
            if (direction === 'out') {
                overlay.style.pointerEvents = 'none';
                overlay.style.opacity = '0';
                overlay.style.transform = '';
            }
            resolve();
        }, duration + 50);
    });
}

// ---------------------------------------------------------------------------
// MenuSystem  -- public API wrapper around ScreenManager
// ---------------------------------------------------------------------------

import type { MenuState, QuickMatchConfig } from './screens/ScreenInterface';

export class MenuSystem {
    private manager: ScreenManager;

    constructor(
        container: HTMLElement,
        onStateChange?: (state: MenuState) => void,
        navigate?: (path: string, params?: Record<string, string>) => void,
    ) {
        const settings = saveManager.getSettings();
        this.manager = new ScreenManager(container, settings, onStateChange, navigate);
        this.manager.render();
    }

    getState(): MenuState {
        return this.manager.getState();
    }

    setState(state: MenuState): void {
        this.manager.setState(state);
    }

    setMatchSetupDefaults(config: Partial<QuickMatchConfig>): void {
        this.manager.setMatchSetupDefaults(config);
    }

    updateLobby(rooms: RoomMetadata[]): void {
        this.manager.updateLobby(rooms);
    }

    showPauseMenu(onResume: () => void, onQuit: () => void): void {
        this.manager.showPauseMenu(onResume, onQuit);
    }

    hide(): void {
        this.manager.hide();
    }

    show(): void {
        this.manager.show();
    }
}
