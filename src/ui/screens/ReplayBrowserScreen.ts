import { listReplays, deleteReplay } from '../../gameplay/Replay';
import type { ReplayMetadata } from '../../gameplay/Replay';
import { escapeHtml, type Screen, type ScreenContext } from './ScreenInterface';

/**
 * Formats a duration in seconds to a human-readable string (e.g. "4:32").
 */
function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats an ISO date string to a short locale display (e.g. "Feb 13, 2026 3:15 PM").
 */
function formatDate(isoDate: string): string {
    try {
        const d = new Date(isoDate);
        if (isNaN(d.getTime())) return isoDate;
        return d.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    } catch {
        return isoDate;
    }
}

export class ReplayBrowserScreen implements Screen {
    private ctx: ScreenContext;
    private root: HTMLDivElement | null = null;
    private selectedKey: string | null = null;
    private pendingDeleteKey: string | null = null;

    constructor(ctx: ScreenContext) {
        this.ctx = ctx;
    }

    render(container: HTMLElement): void {
        const replays = listReplays();

        const wrapper = document.createElement('div');
        wrapper.style.cssText =
            'display:flex;flex-direction:column;align-items:center;width:100%;max-width:700px;margin:0 auto;padding:24px 16px;font-family:Arial,sans-serif;color:#fff;';
        container.appendChild(wrapper);
        this.root = wrapper;

        // Title
        const heading = document.createElement('h1');
        heading.textContent = 'Replay Browser';
        heading.style.cssText =
            'margin:0 0 4px 0;font-size:28px;letter-spacing:1px;text-align:center;';
        wrapper.appendChild(heading);

        const subtitle = document.createElement('p');
        subtitle.textContent = 'Watch past matches and relive great moments.';
        subtitle.style.cssText =
            'margin:0 0 20px 0;font-size:14px;color:#aaa;text-align:center;';
        wrapper.appendChild(subtitle);

        if (replays.length === 0) {
            this.renderEmpty(wrapper);
        } else {
            this.renderList(wrapper, replays);
        }

        // Back button
        const backBtn = document.createElement('button');
        backBtn.className = 'menu-btn';
        backBtn.textContent = 'Back';
        backBtn.style.cssText = 'margin-top:20px;';
        backBtn.addEventListener('click', () => {
            this.ctx.navigate('/title');
        });
        wrapper.appendChild(backBtn);
    }

    private renderEmpty(parent: HTMLElement): void {
        const empty = document.createElement('div');
        empty.style.cssText =
            'text-align:center;padding:48px 16px;background:#1a1a2e;border-radius:8px;margin-bottom:12px;';

        const icon = document.createElement('div');
        icon.textContent = 'No Replays';
        icon.style.cssText =
            'font-size:22px;font-weight:bold;margin-bottom:8px;color:#888;';
        empty.appendChild(icon);

        const msg = document.createElement('p');
        msg.textContent =
            'Play some matches and they will appear here for you to rewatch.';
        msg.style.cssText = 'font-size:14px;color:#666;margin:0;';
        empty.appendChild(msg);

        parent.appendChild(empty);
    }

    private renderList(parent: HTMLElement, replays: ReplayMetadata[]): void {
        const listContainer = document.createElement('div');
        listContainer.style.cssText =
            'width:100%;display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow-y:auto;margin-bottom:12px;';
        parent.appendChild(listContainer);

        for (const replay of replays) {
            const row = document.createElement('div');
            const isSelected = this.selectedKey === replay.key;
            row.style.cssText =
                `display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:${isSelected ? '#2a2a4e' : '#1a1a2e'};border-radius:6px;cursor:pointer;border:2px solid ${isSelected ? '#3498db' : 'transparent'};transition:border-color 0.15s,background 0.15s;`;

            row.addEventListener('mouseenter', () => {
                if (this.selectedKey !== replay.key) {
                    row.style.background = '#222244';
                }
            });
            row.addEventListener('mouseleave', () => {
                if (this.selectedKey !== replay.key) {
                    row.style.background = '#1a1a2e';
                }
            });

            row.addEventListener('click', () => {
                this.selectedKey = replay.key;
                this.ctx.rerender();
            });

            // Left side: info
            const info = document.createElement('div');
            info.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

            const teamsLine = document.createElement('div');
            teamsLine.style.cssText = 'font-size:16px;font-weight:bold;';
            teamsLine.textContent = replay.teams;
            info.appendChild(teamsLine);

            const metaLine = document.createElement('div');
            metaLine.style.cssText = 'font-size:13px;color:#aaa;';
            metaLine.textContent = `${formatDate(replay.date)}  |  Score: ${escapeHtml(replay.score)}  |  ${formatDuration(replay.duration)}`;
            info.appendChild(metaLine);

            row.appendChild(info);

            // Right side: action buttons (only visible when selected)
            if (isSelected) {
                const actions = document.createElement('div');
                actions.style.cssText =
                    'display:flex;gap:8px;align-items:center;flex-shrink:0;';

                const watchBtn = document.createElement('button');
                watchBtn.className = 'menu-btn primary';
                watchBtn.textContent = 'Watch';
                watchBtn.style.cssText =
                    'padding:6px 18px;font-size:14px;';
                watchBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.ctx.navigate('watch_replay', { replayKey: replay.key });
                });
                actions.appendChild(watchBtn);

                if (this.pendingDeleteKey === replay.key) {
                    const confirmLabel = document.createElement('span');
                    confirmLabel.textContent = 'Delete?';
                    confirmLabel.style.cssText = 'font-size:13px;color:#e74c3c;';
                    actions.appendChild(confirmLabel);

                    const confirmBtn = document.createElement('button');
                    confirmBtn.className = 'menu-btn';
                    confirmBtn.textContent = 'Yes';
                    confirmBtn.style.cssText =
                        'padding:6px 12px;font-size:13px;background:#e74c3c;color:#fff;border:none;';
                    confirmBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteReplay(replay.key);
                        this.selectedKey = null;
                        this.pendingDeleteKey = null;
                        this.ctx.rerender();
                    });
                    actions.appendChild(confirmBtn);

                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'menu-btn';
                    cancelBtn.textContent = 'No';
                    cancelBtn.style.cssText =
                        'padding:6px 12px;font-size:13px;';
                    cancelBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.pendingDeleteKey = null;
                        this.ctx.rerender();
                    });
                    actions.appendChild(cancelBtn);
                } else {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'menu-btn';
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.style.cssText =
                        'padding:6px 14px;font-size:14px;color:#e74c3c;';
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.pendingDeleteKey = replay.key;
                        this.ctx.rerender();
                    });
                    actions.appendChild(deleteBtn);
                }

                row.appendChild(actions);
            }

            listContainer.appendChild(row);
        }

        // Replay count
        const countLabel = document.createElement('div');
        countLabel.style.cssText =
            'font-size:12px;color:#666;text-align:center;';
        countLabel.textContent = `${replays.length} replay${replays.length === 1 ? '' : 's'} saved`;
        parent.appendChild(countLabel);
    }

    destroy(): void {
        this.root?.remove();
        this.root = null;
        this.selectedKey = null;
        this.pendingDeleteKey = null;
    }
}
