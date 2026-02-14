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

    // Broadcast-style top bar elements
    private broadcastBar: HTMLDivElement;
    private homeNameEl: HTMLSpanElement;
    private awayNameEl: HTMLSpanElement;
    private homeScoreEl: HTMLSpanElement;
    private awayScoreEl: HTMLSpanElement;
    private possessionEl: HTMLDivElement;
    private playerInfoEl: HTMLDivElement;
    private stallCountEl: HTMLDivElement;
    private playDescEl: HTMLDivElement;
    private playDescTimer: ReturnType<typeof setTimeout> | null = null;

    private readonly onResize = () => {
        this.applyResponsiveLayout();
    };

    constructor(handlers: SpectatorOverlayHandlers) {
        const ui = document.getElementById('ui')!;

        // --- Broadcast-style top scoreboard bar ---
        this.broadcastBar = document.createElement('div');
        this.broadcastBar.style.cssText =
            'position:absolute;top:0;left:50%;transform:translateX(-50%);z-index:45;' +
            'display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 0;pointer-events:none;';
        ui.appendChild(this.broadcastBar);

        // Score row
        const scoreRow = document.createElement('div');
        scoreRow.style.cssText =
            'display:flex;align-items:center;gap:0;border-radius:12px;overflow:hidden;' +
            'border:1px solid rgba(255,255,255,0.22);backdrop-filter:blur(6px);' +
            'box-shadow:0 8px 28px rgba(0,0,0,0.5);';
        this.broadcastBar.appendChild(scoreRow);

        this.homeNameEl = document.createElement('span');
        this.homeNameEl.style.cssText =
            'padding:8px 14px;background:rgba(143,220,255,0.18);font-family:monospace;font-size:14px;' +
            'letter-spacing:0.1em;text-transform:uppercase;color:#8fdcff;font-weight:bold;';
        this.homeNameEl.textContent = 'HOME';
        scoreRow.appendChild(this.homeNameEl);

        this.homeScoreEl = document.createElement('span');
        this.homeScoreEl.style.cssText =
            'padding:8px 16px;background:rgba(6,18,32,0.92);font-family:monospace;font-size:28px;' +
            'font-weight:bold;color:white;min-width:44px;text-align:center;';
        this.homeScoreEl.textContent = '0';
        scoreRow.appendChild(this.homeScoreEl);

        const divider = document.createElement('span');
        divider.style.cssText =
            'padding:8px 6px;background:rgba(6,18,32,0.92);font-family:monospace;font-size:14px;' +
            'color:rgba(255,255,255,0.35);';
        divider.textContent = '-';
        scoreRow.appendChild(divider);

        this.awayScoreEl = document.createElement('span');
        this.awayScoreEl.style.cssText =
            'padding:8px 16px;background:rgba(6,18,32,0.92);font-family:monospace;font-size:28px;' +
            'font-weight:bold;color:white;min-width:44px;text-align:center;';
        this.awayScoreEl.textContent = '0';
        scoreRow.appendChild(this.awayScoreEl);

        this.awayNameEl = document.createElement('span');
        this.awayNameEl.style.cssText =
            'padding:8px 14px;background:rgba(255,215,160,0.18);font-family:monospace;font-size:14px;' +
            'letter-spacing:0.1em;text-transform:uppercase;color:#ffd7a0;font-weight:bold;';
        this.awayNameEl.textContent = 'AWAY';
        scoreRow.appendChild(this.awayNameEl);

        // Possession + player info row
        const infoRow = document.createElement('div');
        infoRow.style.cssText =
            'display:flex;align-items:center;gap:8px;';
        this.broadcastBar.appendChild(infoRow);

        this.possessionEl = document.createElement('div');
        this.possessionEl.style.cssText =
            'padding:3px 10px;border-radius:8px;background:rgba(6,18,32,0.82);' +
            'border:1px solid rgba(255,255,255,0.18);font-family:monospace;font-size:11px;' +
            'letter-spacing:0.06em;color:rgba(255,255,255,0.88);text-transform:uppercase;';
        this.possessionEl.textContent = '';
        infoRow.appendChild(this.possessionEl);

        this.playerInfoEl = document.createElement('div');
        this.playerInfoEl.style.cssText =
            'padding:3px 10px;border-radius:8px;background:rgba(6,18,32,0.82);' +
            'border:1px solid rgba(255,255,255,0.18);font-family:monospace;font-size:11px;' +
            'color:rgba(255,255,255,0.82);';
        this.playerInfoEl.textContent = '';
        infoRow.appendChild(this.playerInfoEl);

        this.stallCountEl = document.createElement('div');
        this.stallCountEl.style.cssText =
            'padding:3px 10px;border-radius:8px;background:rgba(6,18,32,0.82);' +
            'border:1px solid rgba(255,255,255,0.18);font-family:monospace;font-size:13px;' +
            'font-weight:bold;color:white;min-width:28px;text-align:center;';
        this.stallCountEl.textContent = '';
        infoRow.appendChild(this.stallCountEl);

        // Play description (floating, centered)
        this.playDescEl = document.createElement('div');
        this.playDescEl.style.cssText =
            'position:absolute;top:120px;left:50%;transform:translateX(-50%);z-index:45;' +
            'padding:8px 18px;border-radius:10px;background:rgba(6,18,32,0.88);' +
            'border:1px solid rgba(255,209,102,0.35);font-family:monospace;font-size:14px;' +
            'color:white;text-shadow:0 2px 8px rgba(0,0,0,0.6);letter-spacing:0.04em;' +
            'text-align:center;max-width:min(90vw,600px);opacity:0;transition:opacity 0.3s ease;' +
            'pointer-events:none;';
        ui.appendChild(this.playDescEl);

        // --- Bottom transport controls ---
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

    show(): void {
        this.root.style.display = 'flex';
        this.broadcastBar.style.display = 'flex';
    }

    hide(): void {
        this.root.style.display = 'none';
        this.broadcastBar.style.display = 'none';
        this.playDescEl.style.opacity = '0';
    }

    updateScore(home: number, away: number): void {
        this.homeScoreEl.textContent = String(home);
        this.awayScoreEl.textContent = String(away);
    }

    updatePossession(teamName: string, playerName?: string): void {
        this.possessionEl.textContent = teamName ? `Possession: ${teamName}` : '';
        if (playerName !== undefined) {
            this.playerInfoEl.textContent = playerName ? `Disc: ${playerName}` : '';
        }
    }

    updateStallCount(stallCount: number, maxStall: number): void {
        if (stallCount <= 0) {
            this.stallCountEl.textContent = '';
            this.stallCountEl.style.borderColor = 'rgba(255,255,255,0.18)';
            return;
        }
        const clamped = Math.min(maxStall, Math.ceil(stallCount));
        this.stallCountEl.textContent = `Stall ${clamped}`;
        const pct = stallCount / maxStall;
        if (pct >= 0.8) {
            this.stallCountEl.style.color = '#ff4f5e';
            this.stallCountEl.style.borderColor = 'rgba(255,79,94,0.6)';
        } else if (pct >= 0.5) {
            this.stallCountEl.style.color = '#ffc646';
            this.stallCountEl.style.borderColor = 'rgba(255,198,70,0.4)';
        } else {
            this.stallCountEl.style.color = 'white';
            this.stallCountEl.style.borderColor = 'rgba(255,255,255,0.18)';
        }
    }

    showPlayDescription(text: string, duration?: number): void {
        if (this.playDescTimer) {
            clearTimeout(this.playDescTimer);
            this.playDescTimer = null;
        }
        this.playDescEl.textContent = text;
        this.playDescEl.style.opacity = '1';
        const ms = duration ?? 4000;
        this.playDescTimer = setTimeout(() => {
            this.playDescEl.style.opacity = '0';
            this.playDescTimer = null;
        }, ms);
    }

    setTeamNames(homeName: string, awayName: string): void {
        this.homeNameEl.textContent = homeName.toUpperCase();
        this.awayNameEl.textContent = awayName.toUpperCase();
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
        if (this.playDescTimer) clearTimeout(this.playDescTimer);
        this.root.remove();
        this.broadcastBar.remove();
        this.playDescEl.remove();
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
        // Scale the broadcast bar for mobile
        this.homeNameEl.style.fontSize = compact ? '11px' : '14px';
        this.awayNameEl.style.fontSize = compact ? '11px' : '14px';
        this.homeScoreEl.style.fontSize = compact ? '22px' : '28px';
        this.awayScoreEl.style.fontSize = compact ? '22px' : '28px';
        this.homeNameEl.style.padding = compact ? '6px 8px' : '8px 14px';
        this.awayNameEl.style.padding = compact ? '6px 8px' : '8px 14px';
        this.playDescEl.style.top = compact ? '90px' : '120px';
        this.playDescEl.style.fontSize = compact ? '12px' : '14px';
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
