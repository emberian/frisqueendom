export class HUD {
    private scoreEl: HTMLDivElement;
    private stallBar: HTMLDivElement;
    private stallFill: HTMLDivElement;
    private stallLabelEl: HTMLDivElement;
    private stateTextEl: HTMLDivElement;
    private windEl: HTMLDivElement;
    private phaseEl: HTMLDivElement;
    private controlsEl: HTMLDivElement;
    private helpHintEl: HTMLDivElement;
    private helpOverlayEl: HTMLDivElement;
    private spiritEl: HTMLDivElement;
    private timeoutEl: HTMLDivElement;
    private timeoutOverlayEl: HTMLDivElement;
    private helpVisible = false;
    private touchMode = false;
    private contextSignature = '';
    private homeTeamName = 'Home';
    private awayTeamName = 'Away';
    private homeTeamColor = '#8fdcff';
    private awayTeamColor = '#ffd7a0';
    private readonly onKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'KeyH' || e.key === '?') {
            this.setHelpVisible(!this.helpVisible);
            e.preventDefault();
        }
    };
    private readonly onResize = () => {
        this.applyResponsiveLayout();
    };

    constructor() {
        const ui = document.getElementById('ui')!;

        // Score display
        this.scoreEl = document.createElement('div');
        this.scoreEl.style.cssText =
            'position:absolute;top:14px;left:50%;transform:translateX(-50%);' +
            'padding:8px 16px;border-radius:999px;background:rgba(7,16,30,0.86);' +
            'border:1px solid rgba(255,255,255,0.24);backdrop-filter:blur(6px);' +
            'font-family:monospace;font-size:17px;font-weight:bold;color:white;' +
            'text-shadow:0 2px 8px rgba(0,0,0,0.65);letter-spacing:1px;';
        ui.appendChild(this.scoreEl);

        // Stall bar
        const stallContainer = document.createElement('div');
        stallContainer.style.cssText =
            'position:absolute;top:56px;left:50%;transform:translateX(-50%);' +
            'width:220px;height:10px;background:rgba(0,0,0,0.45);border-radius:999px;overflow:hidden;' +
            'border:1px solid rgba(255,255,255,0.18);';
        this.stallFill = document.createElement('div');
        this.stallFill.style.cssText =
            'height:100%;width:0%;border-radius:999px;transition:background 0.15s;';
        stallContainer.appendChild(this.stallFill);
        this.stallBar = stallContainer;
        ui.appendChild(this.stallBar);

        this.stallLabelEl = document.createElement('div');
        this.stallLabelEl.style.cssText =
            'position:absolute;top:74px;left:50%;transform:translateX(-50%);' +
            'padding:2px 8px;border-radius:999px;background:rgba(0,0,0,0.45);' +
            'border:1px solid rgba(255,255,255,0.18);font-family:monospace;font-size:11px;' +
            'letter-spacing:0.09em;color:rgba(255,255,255,0.94);text-transform:uppercase;';
        ui.appendChild(this.stallLabelEl);

        // State text (TURNOVER, SCORE, etc.)
        this.stateTextEl = document.createElement('div');
        this.stateTextEl.style.cssText =
            'position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);' +
            'font-family:monospace;font-size:56px;font-weight:bold;color:white;' +
            'text-shadow:0 8px 24px rgba(0,0,0,0.8),0 0 18px rgba(255,122,34,0.4);' +
            'letter-spacing:0.08em;opacity:0;transition:opacity 0.3s;';
        ui.appendChild(this.stateTextEl);

        // Wind indicator
        this.windEl = document.createElement('div');
        this.windEl.style.cssText =
            'position:absolute;top:14px;left:14px;padding:7px 10px;border-radius:10px;' +
            'background:rgba(5,16,30,0.82);border:1px solid rgba(255,255,255,0.22);' +
            'font-family:monospace;font-size:12px;color:white;text-shadow:0 2px 6px rgba(0,0,0,0.65);';
        ui.appendChild(this.windEl);

        // Phase display
        this.phaseEl = document.createElement('div');
        this.phaseEl.style.cssText =
            'position:absolute;top:14px;right:14px;padding:7px 10px;border-radius:10px;' +
            'background:rgba(5,16,30,0.82);border:1px solid rgba(255,255,255,0.22);' +
            'font-family:monospace;font-size:11px;letter-spacing:0.07em;text-transform:uppercase;' +
            'color:rgba(255,255,255,0.9);text-shadow:0 2px 6px rgba(0,0,0,0.65);';
        ui.appendChild(this.phaseEl);

        // Dynamic controls bar
        this.controlsEl = document.createElement('div');
        this.controlsEl.style.cssText =
            'position:absolute;left:50%;bottom:14px;transform:translateX(-50%);' +
            'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:min(96vw, 900px);' +
            'font-family:monospace;font-size:12px;line-height:1.2;pointer-events:none;filter:drop-shadow(0 6px 18px rgba(0,0,0,0.4));';
        ui.appendChild(this.controlsEl);

        // Always-visible hint for full controls
        this.helpHintEl = document.createElement('div');
        this.helpHintEl.style.cssText =
            'position:absolute;right:16px;bottom:16px;padding:6px 10px;border-radius:8px;' +
            'background:rgba(0,0,0,0.45);color:rgba(255,255,255,0.9);font-family:monospace;' +
            'font-size:12px;text-shadow:1px 1px 2px black;';
        this.helpHintEl.innerHTML = `${renderKey('H')} Controls`;
        ui.appendChild(this.helpHintEl);

        // Full controls overlay
        this.helpOverlayEl = document.createElement('div');
        this.helpOverlayEl.style.cssText =
            'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(6,10,18,0.8);pointer-events:none;';
        this.helpOverlayEl.innerHTML = buildHelpOverlayHtml();
        ui.appendChild(this.helpOverlayEl);

        // Spirit score indicator
        this.spiritEl = document.createElement('div');
        this.spiritEl.style.cssText =
            'position:absolute;top:38px;right:14px;padding:5px 9px;border-radius:8px;' +
            'background:rgba(5,16,30,0.82);border:1px solid rgba(255,255,255,0.22);' +
            'font-family:monospace;font-size:11px;color:rgba(255,255,255,0.9);' +
            'text-shadow:0 2px 6px rgba(0,0,0,0.65);';
        this.spiritEl.textContent = 'Spirit 10/10';
        ui.appendChild(this.spiritEl);

        // Timeout counters (near scoreboard)
        this.timeoutEl = document.createElement('div');
        this.timeoutEl.style.cssText =
            'position:absolute;top:38px;left:50%;transform:translateX(-50%);' +
            'display:flex;gap:14px;padding:4px 10px;border-radius:8px;' +
            'background:rgba(5,16,30,0.78);border:1px solid rgba(255,255,255,0.18);' +
            'font-family:monospace;font-size:11px;color:rgba(255,255,255,0.85);' +
            'text-shadow:0 2px 6px rgba(0,0,0,0.5);letter-spacing:0.05em;';
        this.timeoutEl.innerHTML = '';
        ui.appendChild(this.timeoutEl);

        // Full-screen timeout overlay
        this.timeoutOverlayEl = document.createElement('div');
        this.timeoutOverlayEl.style.cssText =
            'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(4,10,18,0.65);backdrop-filter:blur(4px);z-index:42;pointer-events:none;';
        this.timeoutOverlayEl.innerHTML =
            '<div style="font-family:monospace;font-size:48px;font-weight:bold;color:white;' +
            'text-shadow:0 6px 24px rgba(0,0,0,0.8),0 0 14px rgba(255,209,102,0.5);' +
            'letter-spacing:0.12em;text-transform:uppercase;"></div>';
        ui.appendChild(this.timeoutOverlayEl);

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('resize', this.onResize);
        this.applyResponsiveLayout();
    }

    updateScore(home: number, away: number): void {
        const homeInitials = getInitials(this.homeTeamName);
        const awayInitials = getInitials(this.awayTeamName);
        const badgeStyle = (color: string, size: string) =>
            `display:inline-flex;align-items:center;justify-content:center;width:${size};height:${size};border-radius:50%;background:${color};border:1px solid rgba(255,255,255,0.35);font-size:10px;color:#06101f;`;
        if (window.innerWidth <= 920) {
            this.scoreEl.innerHTML =
                `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="${badgeStyle(this.homeTeamColor, '19px')}">${homeInitials}</span><span style="color:${this.homeTeamColor};">${homeInitials}</span> <span style="color:white;">${home}</span></span>` +
                `<span style="padding:0 6px;color:rgba(255,255,255,0.45);">|</span>` +
                `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="color:white;">${away}</span> <span style="color:${this.awayTeamColor};">${awayInitials}</span><span style="${badgeStyle(this.awayTeamColor, '19px')}">${awayInitials}</span></span>`;
            return;
        }
        this.scoreEl.innerHTML =
            `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="${badgeStyle(this.homeTeamColor, '20px')}">${homeInitials}</span><span style="color:${this.homeTeamColor};">${escapeHtml(this.homeTeamName.toUpperCase())}</span> <span style="color:white;">${home}</span></span>` +
            `<span style="padding:0 9px;color:rgba(255,255,255,0.45);">|</span>` +
            `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="color:white;">${away}</span> <span style="color:${this.awayTeamColor};">${escapeHtml(this.awayTeamName.toUpperCase())}</span><span style="${badgeStyle(this.awayTeamColor, '20px')}">${awayInitials}</span></span>`;
    }

    setTeams(
        homeName: string,
        awayName: string,
        homeColorHex: string,
        awayColorHex: string,
    ): void {
        this.homeTeamName = homeName;
        this.awayTeamName = awayName;
        this.homeTeamColor = homeColorHex;
        this.awayTeamColor = awayColorHex;
    }

    updateStall(stallCount: number, maxStall: number, visible: boolean): void {
        this.stallBar.style.display = visible ? 'block' : 'none';
        this.stallLabelEl.style.display = visible ? 'block' : 'none';
        const pct = Math.min(100, (stallCount / maxStall) * 100);
        this.stallFill.style.width = pct + '%';

        let color: string;
        if (pct < 50) color = '#38d67a';
        else if (pct < 70) color = '#ffc646';
        else if (pct < 90) color = '#ff8a2a';
        else color = '#ff4f5e';
        this.stallFill.style.background = color;
        const stallShown = Math.min(maxStall, Math.ceil(stallCount));
        this.stallLabelEl.textContent = `Stall ${stallShown}`;
    }

    showStateText(text: string, show: boolean): void {
        this.stateTextEl.textContent = text;
        this.stateTextEl.style.opacity = show ? '1' : '0';
    }

    updateWind(speed: number, directionRad: number): void {
        const arrow = getWindArrow(directionRad);
        this.windEl.textContent = `Wind ${arrow} ${speed.toFixed(1)} m/s`;
    }

    updatePhase(phase: string): void {
        this.phaseEl.textContent = phase.replace(/_/g, ' ').toUpperCase();
    }

    updateContext(context: HUDContext): void {
        if (this.touchMode) {
            this.controlsEl.innerHTML = '';
            return;
        }

        const signature = `${context.phase}|${context.hasDisc}|${context.isPlayerOnOffense}|${context.isPlayerPulling}|${context.quickReleaseAvailable}`;
        if (signature === this.contextSignature) {
            return;
        }
        this.contextSignature = signature;

        const actions = getContextActions(context);
        this.controlsEl.innerHTML = actions
            .map((action) =>
                renderActionChip(action.keys, action.label, action.priority === 'high'))
            .join('');
    }
    
    updateSpirit(spiritScore: number): void {
        const clamped = Math.max(0, Math.min(10, spiritScore));
        let color = '#38d67a'; // green
        if (clamped < 4) color = '#ff4f5e'; // red
        else if (clamped < 7) color = '#ffc646'; // yellow
        this.spiritEl.innerHTML =
            `Spirit <span style="color:${color};font-weight:bold;">${clamped.toFixed(0)}</span>/10`;
    }

    setTimeoutCount(homeTimeouts: number, awayTimeouts: number): void {
        const dotStyle = (filled: boolean, color: string) =>
            `display:inline-block;width:8px;height:8px;border-radius:50%;` +
            `background:${filled ? color : 'rgba(255,255,255,0.2)'};` +
            `border:1px solid ${filled ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'};`;
        const renderDots = (count: number, max: number, color: string) => {
            let html = '';
            for (let i = 0; i < max; i++) {
                html += `<span style="${dotStyle(i < count, color)}"></span>`;
            }
            return html;
        };
        const homeInitials = getInitials(this.homeTeamName);
        const awayInitials = getInitials(this.awayTeamName);
        this.timeoutEl.innerHTML =
            `<span style="display:flex;align-items:center;gap:4px;">` +
            `<span style="color:${this.homeTeamColor};font-weight:bold;">${homeInitials}</span>` +
            `<span style="display:flex;gap:3px;">${renderDots(homeTimeouts, 2, this.homeTeamColor)}</span>` +
            `</span>` +
            `<span style="color:rgba(255,255,255,0.35);">TO</span>` +
            `<span style="display:flex;align-items:center;gap:4px;">` +
            `<span style="display:flex;gap:3px;">${renderDots(awayTimeouts, 2, this.awayTeamColor)}</span>` +
            `<span style="color:${this.awayTeamColor};font-weight:bold;">${awayInitials}</span>` +
            `</span>`;
    }

    showTimeoutOverlay(teamName: string): void {
        const inner = this.timeoutOverlayEl.firstElementChild as HTMLElement | null;
        if (inner) inner.textContent = `TIMEOUT — ${teamName}`;
        this.timeoutOverlayEl.style.display = 'flex';
        // Pulse the timeout counter
        this.timeoutEl.style.animation = 'none';
        void this.timeoutEl.offsetHeight;
        this.timeoutEl.style.animation = 'hud-timeout-pulse 0.6s ease 3';
        // Inject keyframes once
        if (!document.getElementById('hud-timeout-keyframes')) {
            const style = document.createElement('style');
            style.id = 'hud-timeout-keyframes';
            style.textContent =
                '@keyframes hud-timeout-pulse{0%,100%{transform:translateX(-50%) scale(1);opacity:0.85}50%{transform:translateX(-50%) scale(1.15);opacity:1}}';
            document.head.appendChild(style);
        }
    }

    hideTimeoutOverlay(): void {
        this.timeoutOverlayEl.style.display = 'none';
        this.timeoutEl.style.animation = '';
    }

    setHelpVisible(visible: boolean): void {
        this.helpVisible = visible;
        this.helpOverlayEl.style.display = visible ? 'flex' : 'none';
        this.helpHintEl.style.opacity = visible ? '0.35' : '1';
    }

    setTouchMode(enabled: boolean): void {
        this.touchMode = enabled;
        if (enabled) {
            this.contextSignature = '';
            this.controlsEl.innerHTML = '';
            this.helpVisible = false;
            this.helpOverlayEl.style.display = 'none';
        }
        this.applyResponsiveLayout();
    }
    
    destroy(): void {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('resize', this.onResize);
        this.scoreEl.remove();
        this.stallBar.remove();
        this.stallLabelEl.remove();
        this.stateTextEl.remove();
        this.windEl.remove();
        this.phaseEl.remove();
        this.controlsEl.remove();
        this.helpHintEl.remove();
        this.helpOverlayEl.remove();
        this.spiritEl.remove();
        this.timeoutEl.remove();
        this.timeoutOverlayEl.remove();
    }

    private applyResponsiveLayout(): void {
        const isMobile = window.innerWidth <= 700;
        const isCompact = window.innerWidth <= 920;
        const showKeyboardHints = !this.touchMode && !isCompact;

        if (isCompact) {
            this.scoreEl.style.top = isMobile ? '8px' : '10px';
            this.scoreEl.style.padding = isMobile ? '6px 10px' : '7px 12px';
            this.scoreEl.style.fontSize = isMobile ? '14px' : '15px';
            this.scoreEl.style.maxWidth = isMobile ? '82vw' : '68vw';
            this.scoreEl.style.overflow = 'hidden';
            this.scoreEl.style.textOverflow = 'ellipsis';
            this.scoreEl.style.whiteSpace = 'nowrap';

            this.windEl.style.top = isMobile ? '52px' : '56px';
            this.windEl.style.left = isMobile ? '8px' : '12px';
            this.windEl.style.padding = isMobile ? '5px 8px' : '6px 9px';
            this.windEl.style.fontSize = isMobile ? '10px' : '11px';
            this.windEl.style.maxWidth = isMobile ? '40vw' : '30vw';
            this.windEl.style.overflow = 'hidden';
            this.windEl.style.textOverflow = 'ellipsis';
            this.windEl.style.whiteSpace = 'nowrap';

            this.phaseEl.style.top = isMobile ? '52px' : '56px';
            this.phaseEl.style.right = isMobile ? '8px' : '12px';
            this.phaseEl.style.padding = isMobile ? '5px 8px' : '6px 9px';
            this.phaseEl.style.fontSize = isMobile ? '10px' : '11px';
            this.phaseEl.style.maxWidth = isMobile ? '40vw' : '30vw';
            this.phaseEl.style.overflow = 'hidden';
            this.phaseEl.style.textOverflow = 'ellipsis';
            this.phaseEl.style.whiteSpace = 'nowrap';

            this.spiritEl.style.top = isMobile ? '76px' : '82px';
            this.spiritEl.style.right = isMobile ? '8px' : '12px';
            this.spiritEl.style.fontSize = isMobile ? '10px' : '11px';

            this.timeoutEl.style.top = isMobile ? '38px' : '42px';
            this.timeoutEl.style.fontSize = isMobile ? '9px' : '10px';

            this.stallBar.style.top = isMobile ? '80px' : '84px';
            this.stallBar.style.width = isMobile ? '180px' : '200px';
            this.stallLabelEl.style.top = isMobile ? '96px' : '100px';

            this.controlsEl.style.bottom = isMobile ? '112px' : '16px';
            this.controlsEl.style.fontSize = isMobile ? '11px' : '12px';
            this.helpHintEl.style.bottom = isMobile ? '104px' : '16px';
            this.controlsEl.style.display = showKeyboardHints ? 'flex' : 'none';
            this.helpHintEl.style.display = showKeyboardHints ? 'block' : 'none';
            return;
        }

        this.scoreEl.style.top = '14px';
        this.scoreEl.style.padding = '8px 16px';
        this.scoreEl.style.fontSize = '17px';
        this.scoreEl.style.maxWidth = '';
        this.scoreEl.style.overflow = '';
        this.scoreEl.style.textOverflow = '';
        this.scoreEl.style.whiteSpace = '';

        this.windEl.style.top = '14px';
        this.windEl.style.left = '14px';
        this.windEl.style.padding = '7px 10px';
        this.windEl.style.fontSize = '12px';
        this.windEl.style.maxWidth = '';
        this.windEl.style.overflow = '';
        this.windEl.style.textOverflow = '';
        this.windEl.style.whiteSpace = '';

        this.phaseEl.style.top = '14px';
        this.phaseEl.style.right = '14px';
        this.phaseEl.style.padding = '7px 10px';
        this.phaseEl.style.fontSize = '11px';
        this.phaseEl.style.maxWidth = '';
        this.phaseEl.style.overflow = '';
        this.phaseEl.style.textOverflow = '';
        this.phaseEl.style.whiteSpace = '';

        this.spiritEl.style.top = '38px';
        this.spiritEl.style.right = '14px';
        this.spiritEl.style.fontSize = '11px';

        this.timeoutEl.style.top = '38px';
        this.timeoutEl.style.fontSize = '11px';

        this.stallBar.style.top = '56px';
        this.stallBar.style.width = '220px';
        this.stallLabelEl.style.top = '74px';

        this.controlsEl.style.bottom = '14px';
        this.controlsEl.style.fontSize = '12px';
        this.helpHintEl.style.bottom = '16px';
        this.controlsEl.style.display = showKeyboardHints ? 'flex' : 'none';
        this.helpHintEl.style.display = showKeyboardHints ? 'block' : 'none';
    }
}

function getWindArrow(rad: number): string {
    const deg = ((rad * 180) / Math.PI + 360) % 360;
    const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    const idx = Math.round(deg / 45) % 8;
    return arrows[idx];
}

interface HUDContext {
    phase: string;
    hasDisc: boolean;
    isPlayerOnOffense: boolean;
    isPlayerPulling: boolean;
    quickReleaseAvailable: boolean;
}

interface ContextAction {
    keys: string;
    label: string;
    priority?: 'high' | 'normal';
}

function renderKey(key: string): string {
    return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.12);font-weight:bold;">${escapeHtml(key)}</span>`;
}

function renderActionChip(
    keys: string,
    label: string,
    highlight: boolean,
): string {
    const bg = highlight ? 'linear-gradient(140deg, rgba(255, 209, 102, 0.23), rgba(255, 122, 34, 0.25))' : 'rgba(4, 14, 28, 0.72)';
    const border = highlight ? 'rgba(255, 209, 102, 0.74)' : 'rgba(255,255,255,0.22)';
    return `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:9px;background:${bg};border:1px solid ${border};color:white;">${renderKey(keys)}<span>${escapeHtml(label)}</span></span>`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getInitials(name: string): string {
    const parts = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (parts.length === 0) return 'TM';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getContextActions(context: HUDContext): ContextAction[] {
    if (context.phase === 'pre_pull') {
        return context.isPlayerPulling
            ? [
                  { keys: 'LMB / Space', label: 'Pull', priority: 'high' },
                  { keys: 'E', label: 'Switch Player' },
                  { keys: 'H', label: 'Controls' },
                  { keys: 'Esc', label: 'Pause' },
              ]
            : [
                  { keys: 'WASD', label: 'Move and Get Open' },
                  { keys: 'Shift', label: 'Sprint' },
                  { keys: 'E', label: 'Switch Player' },
                  { keys: 'H', label: 'Controls' },
              ];
    }

    if (context.phase === 'live_play' && context.hasDisc) {
        const actions: ContextAction[] = [
            { keys: 'LMB Hold', label: 'Charge Throw', priority: 'high' },
            { keys: 'LMB Tap', label: 'Pump Fake' },
            { keys: 'RMB Hold', label: 'Forehand Modifier' },
            { keys: 'Q / B / T', label: 'Special Throws' },
            { keys: 'R / F', label: 'High / Low Release' },
            { keys: 'Wheel', label: 'Hyzer / Anhyzer' },
            { keys: 'A / D', label: 'Pivot' },
            { keys: 'H', label: 'Controls' },
        ];
        if (context.quickReleaseAvailable) {
            actions.unshift({
                keys: 'Space',
                label: 'Quick Release',
                priority: 'high',
            });
        }
        return actions;
    }

    if (context.phase === 'live_play' && context.isPlayerOnOffense) {
        return [
            { keys: 'WASD', label: 'Move (Camera Relative)', priority: 'high' },
            { keys: 'Shift', label: 'Sprint' },
            { keys: 'Space', label: 'Jump / Layout' },
            { keys: 'E', label: 'Switch Player' },
            { keys: 'C / V', label: 'Timeout / Foul Call' },
            { keys: 'H', label: 'Controls' },
        ];
    }

    if (context.phase === 'live_play') {
        return [
            { keys: 'WASD', label: 'Defend (Camera Relative)', priority: 'high' },
            { keys: 'Shift', label: 'Sprint' },
            { keys: 'Space', label: 'Jump / Layout D' },
            { keys: 'E', label: 'Switch Defender' },
            { keys: 'C / V', label: 'Timeout / Foul Call' },
            { keys: 'H', label: 'Controls' },
        ];
    }

    if (context.phase === 'score') {
        return [
            { keys: 'WASD', label: 'Move During Celebration' },
            { keys: 'H', label: 'Controls' },
            { keys: 'Esc', label: 'Pause' },
        ];
    }

    return [
        { keys: 'WASD', label: 'Move' },
        { keys: 'E', label: 'Switch Player' },
        { keys: 'H', label: 'Controls' },
        { keys: 'Esc', label: 'Pause' },
    ];
}

function buildHelpOverlayHtml(): string {
    return `
<div style="width:min(920px, 95vw);max-height:90vh;overflow:auto;background:rgba(10,15,26,0.93);border:1px solid rgba(255,255,255,0.2);border-radius:14px;padding:20px 22px;color:white;font-family:monospace;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <h2 style="margin:0;font-size:24px;letter-spacing:1px;">Controls</h2>
    <div>${renderKey('H')} Close</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px 16px;">
    ${renderHelpSection('Movement', [
        ['WASD', 'Move (camera-relative)'],
        ['Shift', 'Sprint (without disc)'],
        ['Space', 'Jump / layout attempt'],
        ['E', 'Switch controlled player'],
    ])}
    ${renderHelpSection('Throwing (Holding Disc)', [
        ['LMB Hold', 'Charge and release throw'],
        ['LMB Tap', 'Pump fake'],
        ['Mouse', 'Aim throw direction'],
        ['RMB Hold', 'Forehand modifier'],
        ['Wheel', 'Hyzer / anhyzer angle'],
        ['Q', 'Hammer (or scoober with RMB)'],
        ['B', 'Blade throw'],
        ['T', 'Thumber throw'],
        ['R / F', 'High / low release height'],
        ['Space', 'Quick release after catch'],
        ['A / D', 'Pivot while holding disc'],
    ])}
    ${renderHelpSection('Match Controls', [
        ['Esc', 'Pause'],
        ['C', 'Call timeout'],
        ['V', 'Call foul (spirit system)'],
        ['H', 'Toggle this controls panel'],
    ])}
    ${renderHelpSection('Gamepad', [
        ['LS', 'Move'],
        ['RS', 'Aim throw direction'],
        ['RT / LT', 'Throw hold / forehand hold'],
        ['A', 'Jump / quick release'],
        ['X / Start', 'Switch player / pause'],
        ['Y / B / RB', 'Hammer / blade / thumber'],
        ['DPad Up/Down', 'High / low release'],
        ['DPad Left/Right', 'Hyzer / anhyzer curve'],
    ])}
  </div>
</div>`;
}

function renderHelpSection(
    title: string,
    rows: [string, string][],
): string {
    const content = rows
        .map(
            ([keys, desc]) =>
                `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.08);"><span>${renderKey(keys)}</span><span style="text-align:right;color:rgba(255,255,255,0.9);">${escapeHtml(desc)}</span></div>`,
        )
        .join('');
    return `
<section style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;">
  <h3 style="margin:0 0 8px 0;font-size:15px;color:#f0dc8c;">${escapeHtml(title)}</h3>
  ${content}
</section>`;
}
