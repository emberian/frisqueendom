import type { Team } from '../entities/Team';

type BroadcastMode = 'hidden' | 'intro' | 'countdown' | 'status';

interface TeamRenderData {
    name: string;
    colorHex: string;
    lineup: string[];
}

export class BroadcastPackage {
    private root: HTMLDivElement;
    private introCard: HTMLDivElement;
    private countdownCard: HTMLDivElement;
    private statusCard: HTMLDivElement;
    private introTimer = 0;
    private countdownTimer = 0;
    private statusTimer = 0;
    private countdownLabel = 'Pull In';
    private mode: BroadcastMode = 'hidden';
    private runCountdownAfterIntro = false;
    private pullLocked = false;

    constructor() {
        const ui = document.getElementById('ui')!;
        this.root = document.createElement('div');
        this.root.style.cssText =
            'position:absolute;inset:0;pointer-events:none;z-index:40;';
        ui.appendChild(this.root);

        this.introCard = document.createElement('div');
        this.introCard.style.cssText =
            'position:absolute;left:50%;top:16%;transform:translateX(-50%);display:none;';
        this.root.appendChild(this.introCard);

        this.countdownCard = document.createElement('div');
        this.countdownCard.style.cssText =
            'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;';
        this.root.appendChild(this.countdownCard);

        this.statusCard = document.createElement('div');
        this.statusCard.style.cssText =
            'position:absolute;left:50%;bottom:12%;transform:translateX(-50%);display:none;';
        this.root.appendChild(this.statusCard);
    }

    showMatchIntro(
        homeTeam: Team,
        awayTeam: Team,
        gameTo: number,
    ): void {
        const home = toRenderData(homeTeam);
        const away = toRenderData(awayTeam);
        this.introCard.innerHTML = buildIntroHtml(home, away, gameTo);
        this.introCard.style.display = 'block';
        this.introTimer = 3.5;
        this.mode = 'intro';
        this.runCountdownAfterIntro = true;
        this.pullLocked = true;
    }

    showKickoffCountdown(
        seconds: number,
        label: string,
    ): void {
        const countdownSeconds = Math.max(1, Math.floor(seconds));
        this.countdownTimer = countdownSeconds + 0.95;
        this.countdownLabel = label;
        this.mode = 'countdown';
        this.pullLocked = true;
        this.countdownCard.style.display = 'block';
        this.updateCountdownHtml();
    }

    showStatusText(text: string, duration: number = 3): void {
        this.statusCard.innerHTML = `
<div style="padding:10px 24px;border-radius:12px;border:1px solid rgba(255,255,255,0.24);background:rgba(7,18,34,0.85);backdrop-filter:blur(6px);text-align:center;box-shadow:0 12px 32px rgba(0,0,0,0.4);">
  <div style="font-family:monospace;font-size:18px;font-weight:bold;letter-spacing:0.1em;color:#9de5ff;text-transform:uppercase;">${escapeHtml(text)}</div>
</div>`;
        this.statusCard.style.display = 'block';
        this.statusTimer = duration;
        this.mode = 'status';
    }

    update(dt: number): void {
        if (this.mode === 'intro') {
            this.introTimer -= dt;
            if (this.introTimer <= 0) {
                this.introCard.style.display = 'none';
                this.mode = 'hidden';
                if (this.runCountdownAfterIntro) {
                    this.runCountdownAfterIntro = false;
                    this.showKickoffCountdown(3, 'Opening Pull');
                }
            }
            return;
        }

        if (this.mode === 'countdown') {
            this.countdownTimer -= dt;
            this.updateCountdownHtml();
            if (this.countdownTimer <= 0) {
                this.countdownCard.style.display = 'none';
                this.mode = 'hidden';
                this.pullLocked = false;
            }
            return;
        }

        if (this.statusTimer > 0) {
            this.statusTimer -= dt;
            if (this.statusTimer <= 0) {
                this.statusCard.style.display = 'none';
                if (this.mode === 'status') this.mode = 'hidden';
            }
        }
    }

    isPullLocked(): boolean {
        return this.pullLocked;
    }

    isIntroShowing(): boolean {
        return this.mode === 'intro';
    }

    isCountdownShowing(): boolean {
        return this.mode === 'countdown';
    }

    destroy(): void {
        this.root.remove();
    }

    private updateCountdownHtml(): void {
        const remaining = this.countdownTimer;
        let display = 'PULL!';
        if (remaining > 1.0) {
            display = String(Math.ceil(remaining - 0.05));
        }

        const pulse = 1 + Math.max(0, Math.sin(performance.now() / 90) * 0.06);
        this.countdownCard.innerHTML = `
<div style="min-width:220px;padding:14px 20px;border-radius:14px;border:1px solid rgba(255,255,255,0.28);background:linear-gradient(150deg,rgba(7,18,34,0.9),rgba(12,34,58,0.88));text-align:center;box-shadow:0 18px 48px rgba(0,0,0,0.45);transform:scale(${pulse});">
  <div style="font-family:monospace;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.82);">${escapeHtml(this.countdownLabel)}</div>
  <div style="font-family:monospace;font-size:42px;line-height:1.1;font-weight:bold;letter-spacing:0.04em;color:${display === 'PULL!' ? '#ffd166' : '#9de5ff'};text-shadow:0 0 20px rgba(255,209,102,0.35);">${display}</div>
</div>`;
    }
}

function toRenderData(team: Team): TeamRenderData {
    return {
        name: team.name,
        colorHex: toHex(team.primaryColor),
        lineup: team.players.slice(0, 7).map((player, idx) => {
            const statName = player.stats?.fullName;
            if (statName) {
                return `${idx + 1}. ${statName}`;
            }
            return `${idx + 1}. ${readableRole(player.role)} #${idx + 1}`;
        }),
    };
}

function buildIntroHtml(
    home: TeamRenderData,
    away: TeamRenderData,
    gameTo: number,
): string {
    return `
<div style="width:min(960px,95vw);border-radius:18px;border:1px solid rgba(255,255,255,0.28);background:linear-gradient(150deg,rgba(6,16,30,0.94),rgba(9,28,49,0.9));box-shadow:0 22px 64px rgba(0,0,0,0.5);padding:16px 16px 14px;">
  <div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-bottom:10px;">
    <span style="font-family:monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);">Live Match Broadcast</span>
    <span style="font-family:monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;padding:4px 9px;border-radius:999px;background:rgba(255,209,102,0.2);border:1px solid rgba(255,209,102,0.4);color:#ffd166;">Game To ${gameTo}</span>
  </div>
  <div style="display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:start;gap:10px;">
    ${buildTeamCard(home, 'home')}
    <div style="align-self:center;justify-self:center;font-family:monospace;font-size:42px;font-weight:bold;color:#ffd166;letter-spacing:0.08em;text-shadow:0 0 20px rgba(255,209,102,0.4);padding-top:24px;">VS</div>
    ${buildTeamCard(away, 'away')}
  </div>
</div>`;
}

function buildTeamCard(team: TeamRenderData, align: 'home' | 'away'): string {
    const alignValue = align === 'home' ? 'left' : 'right';
    const lineupItems = team.lineup
        .map((name) => `<li style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.08);">${escapeHtml(name)}</li>`)
        .join('');
    return `
<div style="padding:10px;border-radius:12px;background:rgba(3,10,20,0.45);border:1px solid rgba(255,255,255,0.16);text-align:${alignValue};">
  <div style="display:flex;${align === 'home' ? 'justify-content:flex-start;' : 'justify-content:flex-end;'}align-items:center;gap:8px;margin-bottom:8px;">
    ${align === 'away' ? `<h3 style="margin:0;font-family:monospace;font-size:20px;letter-spacing:0.06em;color:${team.colorHex};text-transform:uppercase;">${escapeHtml(team.name)}</h3>` : ''}
    <span style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:${team.colorHex};border:2px solid rgba(255,255,255,0.45);font-family:monospace;font-weight:bold;color:#04111f;">${escapeHtml(getInitials(team.name))}</span>
    ${align === 'home' ? `<h3 style="margin:0;font-family:monospace;font-size:20px;letter-spacing:0.06em;color:${team.colorHex};text-transform:uppercase;">${escapeHtml(team.name)}</h3>` : ''}
  </div>
  <div style="font-family:monospace;font-size:11px;letter-spacing:0.13em;text-transform:uppercase;color:rgba(255,255,255,0.78);margin-bottom:6px;">Starting 7</div>
  <ol style="list-style:none;margin:0;padding:0;font-family:monospace;font-size:12px;color:rgba(255,255,255,0.92);">${lineupItems}</ol>
</div>`;
}

function readableRole(role: string): string {
    if (role === 'deep_cutter') return 'Deep Cutter';
    return role.charAt(0).toUpperCase() + role.slice(1);
}

function toHex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
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

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
