import type { Screen, ScreenContext } from './ScreenInterface';

export class PauseScreen implements Screen {
    private ctx: ScreenContext;
    private root: HTMLDivElement | null = null;
    private onResume: () => void;
    private onQuit: () => void;

    constructor(ctx: ScreenContext, onResume: () => void, onQuit: () => void) {
        this.ctx = ctx;
        this.onResume = onResume;
        this.onQuit = onQuit;
    }

    setCallbacks(onResume: () => void, onQuit: () => void): void {
        this.onResume = onResume;
        this.onQuit = onQuit;
    }

    render(container: HTMLElement): void {
        const pause = document.createElement('div');
        pause.className = 'pause-menu';
        pause.innerHTML = `
            <div class="pause-content">
                <h2>Paused</h2>
                <button class="menu-btn" id="resume">Resume</button>
                <button class="menu-btn" id="settings">Settings</button>
                <button class="menu-btn danger" id="quit">Quit Match</button>
            </div>
        `;
        container.appendChild(pause);
        this.root = pause;

        pause.querySelector('#resume')?.addEventListener('click', () => {
            this.ctx.setState('none');
            this.onResume();
        });

        pause.querySelector('#settings')?.addEventListener('click', () => {
            this.ctx.setState('settings');
        });

        pause.querySelector('#quit')?.addEventListener('click', () => {
            if (confirm('Quit current match? Progress will not be saved.')) {
                this.onQuit();
            }
        });
    }

    destroy(): void {
        this.root?.remove();
        this.root = null;
    }
}
