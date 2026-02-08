export type SpectatorView = 'auto' | 'broadcast' | 'disc' | 'home' | 'away';

interface SpectatorOverlayHandlers {
    onSetView: (view: SpectatorView) => void;
    onSpeedSet: (speed: number) => void;
    onTogglePause: () => void;
}

export class SpectatorOverlay {
    private root: HTMLDivElement;
    private statusEl: HTMLDivElement;
    private hintsEl: HTMLDivElement;
    private cameraGrid: HTMLDivElement;
    private transportGrid: HTMLDivElement;
    private viewButtons: Record<SpectatorView, HTMLButtonElement>;
    private speedButtons: Array<{ speed: number; button: HTMLButtonElement }> = [];
    private pauseButton: HTMLButtonElement;
    private readonly onResize = () => {
        this.applyResponsiveLayout();
    };

    constructor(handlers: SpectatorOverlayHandlers) {
        const ui = document.getElementById('ui')!;
        this.root = document.createElement('div');
        this.root.style.cssText =
            'position:absolute;left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);' +
            'z-index:43;pointer-events:auto;display:flex;flex-direction:column;gap:6px;align-items:stretch;width:min(94vw,460px);';
        ui.appendChild(this.root);

        this.statusEl = document.createElement('div');
        this.statusEl.style.cssText =
            'padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.24);' +
            'background:rgba(6,18,32,0.88);font-family:monospace;font-size:11px;letter-spacing:0.05em;' +
            'color:rgba(255,255,255,0.95);text-transform:uppercase;text-align:center;';
        this.root.appendChild(this.statusEl);

        this.cameraGrid = document.createElement('div');
        this.cameraGrid.style.cssText =
            'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;';
        this.root.appendChild(this.cameraGrid);

        this.transportGrid = document.createElement('div');
        this.transportGrid.style.cssText =
            'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;';
        this.root.appendChild(this.transportGrid);

        this.viewButtons = {
            auto: makeButton('AUTO', () => handlers.onSetView('auto')),
            broadcast: makeButton('BCAST', () => handlers.onSetView('broadcast')),
            disc: makeButton('DISC', () => handlers.onSetView('disc')),
            home: makeButton('HOME', () => handlers.onSetView('home')),
            away: makeButton('AWAY', () => handlers.onSetView('away')),
        };
        for (const view of ['auto', 'broadcast', 'disc', 'home', 'away'] as const) {
            this.cameraGrid.appendChild(this.viewButtons[view]);
        }

        const speeds = [0.5, 1, 1.5, 2];
        for (const speed of speeds) {
            const button = makeButton(`${speed}X`, () => handlers.onSpeedSet(speed));
            this.transportGrid.appendChild(button);
            this.speedButtons.push({ speed, button });
        }
        this.pauseButton = makeButton('PAUSE', () => handlers.onTogglePause());
        this.transportGrid.appendChild(this.pauseButton);

        this.hintsEl = document.createElement('div');
        this.hintsEl.style.cssText =
            'padding:4px 8px;border-radius:9px;border:1px solid rgba(255,255,255,0.16);' +
            'background:rgba(5,14,27,0.74);font-family:monospace;font-size:10px;letter-spacing:0.04em;' +
            'color:rgba(255,255,255,0.8);text-align:center;';
        this.hintsEl.textContent =
            'Keys: 1 auto | 2-5 cams | [ ] speed | 0 reset | P/Space pause | D debug';
        this.root.appendChild(this.hintsEl);

        window.addEventListener('resize', this.onResize);
        this.applyResponsiveLayout();
        this.setState(
            'auto',
            1,
            false,
            'broadcast',
            'pre_pull',
            'home',
        );
    }

    setState(
        selectedView: SpectatorView,
        speed: number,
        paused: boolean,
        effectiveView: SpectatorView,
        phase: string,
        offenseTeam: 'home' | 'away',
    ): void {
        const viewLabel =
            selectedView === 'auto'
                ? `Auto (${prettyView(effectiveView)})`
                : prettyView(selectedView);
        this.statusEl.textContent =
            `Spectator • ${viewLabel} • ${speed.toFixed(2)}x • ${paused ? 'Paused' : 'Live'} • ${phaseLabel(phase)} • ${offenseTeam.toUpperCase()} O`;

        for (const view of ['auto', 'broadcast', 'disc', 'home', 'away'] as const) {
            setButtonActive(this.viewButtons[view], selectedView === view, 'gold');
        }
        for (const entry of this.speedButtons) {
            const active = Math.abs(entry.speed - speed) < 0.001;
            setButtonActive(entry.button, active, 'cyan');
        }
        this.pauseButton.textContent = paused ? 'PLAY' : 'PAUSE';
        setButtonActive(this.pauseButton, paused, 'orange');
    }

    destroy(): void {
        window.removeEventListener('resize', this.onResize);
        this.root.remove();
    }

    private applyResponsiveLayout(): void {
        const compact = window.innerWidth <= 760;
        this.cameraGrid.style.gridTemplateColumns = compact
            ? 'repeat(3,minmax(0,1fr))'
            : 'repeat(5,minmax(0,1fr))';
        this.transportGrid.style.gridTemplateColumns = compact
            ? 'repeat(3,minmax(0,1fr))'
            : 'repeat(5,minmax(0,1fr))';
        this.statusEl.style.fontSize = compact ? '10px' : '11px';
        this.hintsEl.style.fontSize = compact ? '9px' : '10px';
    }
}

function phaseLabel(phase: string): string {
    return phase.replace(/_/g, ' ');
}

function prettyView(view: SpectatorView): string {
    switch (view) {
        case 'auto':
            return 'Auto';
        case 'broadcast':
            return 'Broadcast';
        case 'disc':
            return 'Disc Cam';
        case 'home':
            return 'Home Focus';
        case 'away':
            return 'Away Focus';
        default:
            return 'Broadcast';
    }
}

type AccentTone = 'gold' | 'cyan' | 'orange';

function setButtonActive(
    button: HTMLButtonElement,
    active: boolean,
    tone: AccentTone,
): void {
    if (!active) {
        button.style.borderColor = 'rgba(255,255,255,0.28)';
        button.style.background =
            'linear-gradient(150deg,rgba(7,20,35,0.9),rgba(9,30,54,0.86))';
        return;
    }
    const accent =
        tone === 'cyan'
            ? 'rgba(143,220,255,0.95)'
            : tone === 'orange'
            ? 'rgba(255,122,34,0.92)'
            : 'rgba(255,209,102,0.95)';
    button.style.borderColor = accent;
    button.style.background =
        tone === 'orange'
            ? 'linear-gradient(150deg,rgba(255,122,34,0.86),rgba(255,77,109,0.82))'
            : 'linear-gradient(150deg,rgba(16,47,74,0.94),rgba(11,34,58,0.88))';
}

function makeButton(
    text: string,
    onClick: () => void,
): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.style.cssText =
        'pointer-events:auto;min-height:34px;padding:5px 8px;border-radius:9px;' +
        'border:1px solid rgba(255,255,255,0.28);' +
        'background:linear-gradient(150deg,rgba(7,20,35,0.9),rgba(9,30,54,0.86));' +
        'color:white;font-family:monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;' +
        'touch-action:manipulation;';
    button.addEventListener('click', onClick);
    return button;
}
