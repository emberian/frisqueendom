export interface HalftimeTeamStats {
    teamName: string;
    turnovers: number;
    completionPct: number;
    longThrowMeters: number;
    goals?: number;
    blocks?: number;
}

export interface HalftimeSummary {
    home: HalftimeTeamStats;
    away: HalftimeTeamStats;
    momentumLabel: string;
    momentumValue: number; // -1 (away) .. +1 (home)
}

export interface HalftimeStats {
    homeGoals: number;
    awayGoals: number;
    homeBlocks: number;
    awayBlocks: number;
    homeTurnovers: number;
    awayTurnovers: number;
    homeTeamName?: string;
    awayTeamName?: string;
    momentumLabel?: string;
    momentumValue?: number;
}

export class HalftimeOverlay {
    private root: HTMLDivElement;
    private continueCallback: (() => void) | null = null;

    constructor() {
        const ui = document.getElementById('ui')!;
        this.root = document.createElement('div');
        this.root.style.cssText =
            'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(4,10,18,0.78);backdrop-filter:blur(6px);z-index:44;pointer-events:auto;' +
            'opacity:0;transition:opacity 0.4s ease;';
        ui.appendChild(this.root);
    }

    /**
     * Show halftime overlay with full HalftimeSummary (original signature).
     * Accepts an optional onContinue callback directly.
     */
    show(
        summaryOrHomeScore: HalftimeSummary | number,
        onContinueOrAwayScore?: (() => void) | number,
        statsArg?: HalftimeStats,
    ): void {
        // Determine which overload was called
        if (typeof summaryOrHomeScore === 'number') {
            // Called as show(homeScore, awayScore, stats)
            const homeScore = summaryOrHomeScore;
            const awayScore = (onContinueOrAwayScore as number) || 0;
            const stats = statsArg || {
                homeGoals: homeScore,
                awayGoals: awayScore,
                homeBlocks: 0,
                awayBlocks: 0,
                homeTurnovers: 0,
                awayTurnovers: 0,
            };
            const summary: HalftimeSummary = {
                home: {
                    teamName: stats.homeTeamName || 'Home',
                    turnovers: stats.homeTurnovers,
                    completionPct: 0,
                    longThrowMeters: 0,
                    goals: stats.homeGoals,
                    blocks: stats.homeBlocks,
                },
                away: {
                    teamName: stats.awayTeamName || 'Away',
                    turnovers: stats.awayTurnovers,
                    completionPct: 0,
                    longThrowMeters: 0,
                    goals: stats.awayGoals,
                    blocks: stats.awayBlocks,
                },
                momentumLabel: stats.momentumLabel || '',
                momentumValue: stats.momentumValue ?? 0,
            };
            this.renderOverlay(summary, homeScore, awayScore);
        } else {
            // Called as show(summary, onContinue?)
            const summary = summaryOrHomeScore;
            if (typeof onContinueOrAwayScore === 'function') {
                this.continueCallback = onContinueOrAwayScore;
            }
            this.renderOverlay(summary);
        }
    }

    private renderOverlay(
        summary: HalftimeSummary,
        homeScore?: number,
        awayScore?: number,
    ): void {
        const clampedMomentum = Math.max(-1, Math.min(1, summary.momentumValue));
        const momentumPercent = 50 + clampedMomentum * 50;
        const hScore = homeScore ?? (summary.home.goals ?? 0);
        const aScore = awayScore ?? (summary.away.goals ?? 0);

        this.root.innerHTML = `
<div class="halftime-panel" style="width:min(900px,95vw);max-height:90vh;overflow:auto;border-radius:18px;border:1px solid rgba(255,255,255,0.24);background:linear-gradient(150deg,rgba(5,14,28,0.95),rgba(9,28,49,0.92));box-shadow:0 30px 90px rgba(0,0,0,0.55);padding:18px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
    <div>
      <div style="font-family:monospace;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.72);">Broadcast Break</div>
      <h2 style="margin:6px 0 2px;font-family:monospace;font-size:32px;letter-spacing:0.07em;color:#ffd166;">Halftime Report</h2>
      <div style="font-family:monospace;font-size:13px;color:rgba(255,255,255,0.82);">Teams switch ends for the second half.</div>
    </div>
    <button id="continue-halftime" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.26);background:linear-gradient(150deg,rgba(255,122,34,0.92),rgba(255,77,109,0.9));color:white;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;">Start 2nd Half</button>
  </div>

  <section style="margin-top:14px;padding:14px;border-radius:14px;background:rgba(3,10,20,0.55);border:1px solid rgba(255,255,255,0.18);text-align:center;">
    <div style="display:flex;justify-content:center;align-items:center;gap:16px;font-family:monospace;">
      <div style="text-align:right;">
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8fdcff;">${escapeHtml(summary.home.teamName)}</div>
        <div style="font-size:42px;font-weight:bold;color:white;text-shadow:0 4px 16px rgba(143,220,255,0.4);">${hScore}</div>
      </div>
      <div style="font-size:16px;color:rgba(255,255,255,0.4);padding:0 6px;">-</div>
      <div style="text-align:left;">
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#ffd7a0;">${escapeHtml(summary.away.teamName)}</div>
        <div style="font-size:42px;font-weight:bold;color:white;text-shadow:0 4px 16px rgba(255,215,160,0.4);">${aScore}</div>
      </div>
    </div>
  </section>

  ${summary.momentumLabel ? `
  <section style="margin-top:12px;padding:10px;border-radius:12px;background:rgba(3,10,20,0.45);border:1px solid rgba(255,255,255,0.14);">
    <h3 style="margin:0 0 8px;font-family:monospace;font-size:15px;letter-spacing:0.08em;text-transform:uppercase;color:#8fdcff;">Momentum</h3>
    <div style="font-family:monospace;font-size:13px;color:rgba(255,255,255,0.85);margin-bottom:8px;">${escapeHtml(summary.momentumLabel)}</div>
    <div style="height:16px;border-radius:999px;overflow:hidden;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.45);display:grid;grid-template-columns:${momentumPercent}% ${100 - momentumPercent}%;">
      <div style="background:linear-gradient(90deg,rgba(120,220,255,0.95),rgba(120,220,255,0.75));"></div>
      <div style="background:linear-gradient(90deg,rgba(255,190,120,0.72),rgba(255,190,120,0.95));"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:11px;color:rgba(255,255,255,0.72);margin-top:6px;">
      <span>${escapeHtml(summary.home.teamName)}</span>
      <span>${escapeHtml(summary.away.teamName)}</span>
    </div>
  </section>
  ` : ''}

  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:12px;">
    ${renderTeamCard(summary.home, '#8fdcff')}
    ${renderTeamCard(summary.away, '#ffd7a0')}
  </div>
</div>`;

        this.root.style.display = 'flex';
        // Trigger fade-in animation
        this.root.style.opacity = '0';
        void this.root.offsetHeight;
        this.root.style.opacity = '1';

        this.root
            .querySelector<HTMLButtonElement>('#continue-halftime')
            ?.addEventListener('click', () => {
                this.hide();
                this.continueCallback?.();
            });
    }

    hide(): void {
        this.root.style.opacity = '0';
        // Wait for fade-out then fully remove
        setTimeout(() => {
            this.root.style.display = 'none';
            this.root.innerHTML = '';
        }, 400);
    }

    onContinue(callback: () => void): void {
        this.continueCallback = callback;
    }

    destroy(): void {
        this.root.remove();
    }
}

function renderTeamCard(
    stats: HalftimeTeamStats,
    accent: string,
): string {
    const goalsRow = stats.goals != null
        ? `<span style="color:rgba(255,255,255,0.74);">Goals</span><strong>${stats.goals}</strong>`
        : '';
    const blocksRow = stats.blocks != null
        ? `<span style="color:rgba(255,255,255,0.74);">Blocks</span><strong>${stats.blocks}</strong>`
        : '';
    return `
<section style="padding:10px;border-radius:12px;background:rgba(3,10,20,0.45);border:1px solid rgba(255,255,255,0.14);">
  <h3 style="margin:0 0 8px;font-family:monospace;font-size:16px;letter-spacing:0.08em;text-transform:uppercase;color:${accent};">${escapeHtml(stats.teamName)}</h3>
  <div style="display:grid;grid-template-columns:1fr auto;gap:6px;font-family:monospace;font-size:13px;">
    ${goalsRow}
    ${blocksRow}
    <span style="color:rgba(255,255,255,0.74);">Turnovers</span><strong>${stats.turnovers}</strong>
    <span style="color:rgba(255,255,255,0.74);">Completions</span><strong>${stats.completionPct.toFixed(0)}%</strong>
    <span style="color:rgba(255,255,255,0.74);">Long Throw</span><strong>${stats.longThrowMeters.toFixed(1)}m</strong>
  </div>
</section>`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
