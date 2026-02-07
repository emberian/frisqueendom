export interface HalftimeTeamStats {
    teamName: string;
    turnovers: number;
    completionPct: number;
    longThrowMeters: number;
}

export interface HalftimeSummary {
    home: HalftimeTeamStats;
    away: HalftimeTeamStats;
    momentumLabel: string;
    momentumValue: number; // -1 (away) .. +1 (home)
}

export class HalftimeOverlay {
    private root: HTMLDivElement;

    constructor() {
        const ui = document.getElementById('ui')!;
        this.root = document.createElement('div');
        this.root.style.cssText =
            'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(4,10,18,0.78);backdrop-filter:blur(6px);z-index:44;pointer-events:auto;';
        ui.appendChild(this.root);
    }

    show(
        summary: HalftimeSummary,
        onContinue: () => void,
    ): void {
        const clampedMomentum = Math.max(-1, Math.min(1, summary.momentumValue));
        const momentumPercent = 50 + clampedMomentum * 50;
        this.root.innerHTML = `
<div style="width:min(900px,95vw);max-height:90vh;overflow:auto;border-radius:18px;border:1px solid rgba(255,255,255,0.24);background:linear-gradient(150deg,rgba(5,14,28,0.95),rgba(9,28,49,0.92));box-shadow:0 30px 90px rgba(0,0,0,0.55);padding:18px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
    <div>
      <div style="font-family:monospace;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.72);">Broadcast Break</div>
      <h2 style="margin:6px 0 2px;font-family:monospace;font-size:32px;letter-spacing:0.07em;color:#ffd166;">Halftime Report</h2>
      <div style="font-family:monospace;font-size:13px;color:rgba(255,255,255,0.82);">Teams switch ends for the second half.</div>
    </div>
    <button id="continue-halftime" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.26);background:linear-gradient(150deg,rgba(255,122,34,0.92),rgba(255,77,109,0.9));color:white;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;">Start 2nd Half</button>
  </div>

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

  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-top:12px;">
    ${renderTeamCard(summary.home, '#8fdcff')}
    ${renderTeamCard(summary.away, '#ffd7a0')}
  </div>
</div>`;
        this.root.style.display = 'flex';
        this.root
            .querySelector<HTMLButtonElement>('#continue-halftime')
            ?.addEventListener('click', () => {
                this.hide();
                onContinue();
            });
    }

    hide(): void {
        this.root.style.display = 'none';
        this.root.innerHTML = '';
    }

    destroy(): void {
        this.root.remove();
    }
}

function renderTeamCard(
    stats: HalftimeTeamStats,
    accent: string,
): string {
    return `
<section style="padding:10px;border-radius:12px;background:rgba(3,10,20,0.45);border:1px solid rgba(255,255,255,0.14);">
  <h3 style="margin:0 0 8px;font-family:monospace;font-size:16px;letter-spacing:0.08em;text-transform:uppercase;color:${accent};">${escapeHtml(stats.teamName)}</h3>
  <div style="display:grid;grid-template-columns:1fr auto;gap:6px;font-family:monospace;font-size:13px;">
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
