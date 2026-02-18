import {
    CAREER_HOME_REGIONS,
    saveManager,
    createNewCareer,
    listCareerSlots,
    loadCareer,
    saveCareer,
    setActiveCareerSlot,
    type CareerDifficulty,
    type HomeRegion,
} from '../../data/SaveLoad';
import { XP_PER_LEVEL } from '../../data/Progression';
import type { RoomMetadata } from '../../network/protocol';
import { escapeHtml, type Screen, type ScreenContext } from './ScreenInterface';

export class TitleScreen implements Screen {
    private ctx: ScreenContext;
    private root: HTMLDivElement | null = null;
    private container: HTMLElement | null = null;

    constructor(ctx: ScreenContext) {
        this.ctx = ctx;
    }

    render(container: HTMLElement): void {
        this.container = container;
        const hasCareer = !!loadCareer();
        const slots = listCareerSlots();
        const filledSlots = slots.filter((slot) => !!slot).length;
        const progression = saveManager.getProgression();
        const levelStartXP = (progression.level - 1) * XP_PER_LEVEL;
        const currentLevelXP = progression.experience - levelStartXP;
        const progressPct = Math.min(100, Math.max(0, (currentLevelXP / XP_PER_LEVEL) * 100));
        const activeChallenges = progression.dailyChallenges.filter((challenge) => !challenge.completed);
        const challengesHtml =
            activeChallenges.length > 0
                ? activeChallenges
                      .slice(0, 3)
                      .map(
                          (challenge) => `
                <div class="menu-challenge-item">
                    <span class="challenge-desc">${escapeHtml(challenge.description)}</span>
                    <span class="challenge-progress">${challenge.progress}/${challenge.target}</span>
                 </div>`,
                      )
                      .join('')
                : '<div class="menu-challenge-item">All daily challenges completed!</div>';

        const title = document.createElement('div');
        title.className = 'title-screen';
        title.innerHTML = `
            <p class="title-eyebrow">BROADCAST ARCADE EDITION</p>
            <div class="title-layout">
                <div class="title-hero">
                    <h1 class="game-title" aria-label="Frisqueendom">
                        <span class="title-word">Fris</span>
                        <span class="title-disc"><img src="/queen-disc.svg" alt="" /></span>
                        <span class="title-word title-word-dom">Dom</span>
                    </h1>
                    <p class="game-subtitle">Arcade ultimate with style, weather, and live momentum.</p>
                    <div class="title-features">
                        <span><b>01</b> Live Broadcasts</span>
                        <span><b>02</b> Career Progression</span>
                        <span><b>03</b> Practice Drills</span>
                    </div>
                    <div class="title-command-deck">
                        <div class="title-quick-play" style="display:flex;gap:12px;margin-bottom:16px;">
                            <button class="menu-btn primary" id="play-now" style="flex:1;font-size:20px;padding:16px 24px;">Play Now</button>
                            <button class="menu-btn primary" id="play-2p" style="flex:1;font-size:20px;padding:16px 24px;">2 Player</button>
                        </div>
                        <div class="menu-profile-card title-player-card">
                            <div class="profile-header">
                                <div class="profile-level">${progression.level}</div>
                                <div class="profile-info">
                                    <div class="profile-label">Player Level</div>
                                    <div class="profile-xp-bar">
                                        <div class="profile-xp-fill" style="width: ${progressPct}%"></div>
                                    </div>
                                    <div class="profile-xp-text">${currentLevelXP} / ${XP_PER_LEVEL} XP</div>
                                </div>
                            </div>
                            <div class="title-player-meta">
                                <span>Career Slots ${filledSlots}/3</span>
                                <span>${hasCareer ? 'Save Ready' : 'No Active Career'}</span>
                            </div>
                            <div class="profile-challenges">
                                <div class="profile-label">Daily Challenges</div>
                                ${challengesHtml}
                            </div>
                        </div>
                        <div class="title-menu-grid">
                            <button class="menu-btn" id="menu-career">${hasCareer ? 'Continue Career' : 'Start Career'}</button>
                            <button class="menu-btn" id="menu-match">Match Setup</button>
                            <button class="menu-btn" id="menu-watch">Watch Match</button>
                            <button class="menu-btn" id="menu-practice">Practice Mode</button>
                            <button class="menu-btn" id="menu-locker">Locker Room</button>
                            <button class="menu-btn" id="menu-tutorial">Tutorial</button>
                            <button class="menu-btn" id="menu-settings">Settings</button>
                            <button class="menu-btn" id="menu-credits">Credits</button>
                        </div>
                    </div>
                </div>

                <div id="lobby-container" class="lobby-container">
                    <div class="lobby-header">
                        <h2>LIVE BROADCASTS</h2>
                        <button class="menu-btn small" id="refresh-lobby">Refresh</button>
                    </div>
                    <div id="featured-preview" class="featured-preview">
                        <div class="preview-label">LIVE PREVIEW</div>
                        <div id="preview-content" class="preview-content">
                            <div class="preview-placeholder">Searching for active matches...</div>
                        </div>
                    </div>
                    <div id="room-list" class="room-list">
                        <div class="list-placeholder">No active matches found.</div>
                    </div>
                </div>
            </div>

            <div class="title-footer">
                <div class="title-actions">
                    <button class="menu-btn primary" id="quick-local">Quick Match (Solo)</button>
                    <button class="menu-btn primary" id="quick-online">Quick Match (Multi)</button>
                    <button class="menu-btn" id="quick-career">${hasCareer ? 'Career Desk' : 'Create Career'}</button>
                </div>
                <p class="version">v0.1.0 - Browser Edition</p>
            </div>
        `;
        container.appendChild(title);
        this.root = title;

        // Play Now — instant game with arcade defaults
        title.querySelector('#play-now')?.addEventListener('click', () => {
            this.ctx.navigate('/play', { color: 'blue', difficulty: 'easy', gameTo: '7', multiplayer: 'single' });
        });

        // 2 Player — same-screen split
        title.querySelector('#play-2p')?.addEventListener('click', () => {
            this.ctx.navigate('/play', { color: 'blue', difficulty: 'easy', gameTo: '7', multiplayer: 'local_split' });
        });

        title.querySelector('#quick-local')?.addEventListener('click', () => {
            this.ctx.navigate('/play', { color: 'blue', difficulty: 'easy', gameTo: '15', multiplayer: 'single' });
        });

        title.querySelector('#quick-online')?.addEventListener('click', () => {
            this.ctx.navigate('/setup');
        });

        const openCareer = () => {
            if (hasCareer) {
                this.showCareerSlotDialog();
            } else {
                this.showNewCareerDialog();
            }
        };

        title.querySelector('#quick-career')?.addEventListener('click', openCareer);
        title.querySelector('#menu-career')?.addEventListener('click', openCareer);

        title.querySelector('#menu-match')?.addEventListener('click', () => {
            this.ctx.navigate('/setup');
        });

        title.querySelector('#menu-watch')?.addEventListener('click', () => {
            this.ctx.navigate('/setup');
        });

        title.querySelector('#menu-practice')?.addEventListener('click', () => {
            this.ctx.navigate('/practice');
        });

        title.querySelector('#menu-locker')?.addEventListener('click', () => {
            this.ctx.navigate('/locker');
        });

        title.querySelector('#menu-tutorial')?.addEventListener('click', () => {
            this.ctx.navigate('/tutorial');
        });

        title.querySelector('#menu-settings')?.addEventListener('click', () => {
            this.ctx.navigate('/settings');
        });

        title.querySelector('#menu-credits')?.addEventListener('click', () => {
            this.ctx.navigate('/credits');
        });

        const refreshBtn = title.querySelector('#refresh-lobby');
        refreshBtn?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('refreshLobby'));
        });
    }

    updateLobby(rooms: RoomMetadata[]): void {
        const listContainer = document.getElementById('room-list');
        const previewContainer = document.getElementById('preview-content');
        if (!listContainer || !previewContainer) return;

        if (rooms.length === 0) {
            listContainer.innerHTML = '<div class="list-placeholder">No active matches found.</div>';
            previewContainer.innerHTML = '<div class="preview-placeholder">Searching for active matches...</div>';
            return;
        }

        listContainer.innerHTML = rooms.map(room => `
            <div class="room-item" onclick="window.dispatchEvent(new CustomEvent('joinLobbyRoom', { detail: { room: '${room.room}' } }))">
                <div class="room-info">
                    <div class="room-teams">${escapeHtml(room.homeName)} vs ${escapeHtml(room.awayName)}</div>
                    <div class="room-meta">${room.homeScore} - ${room.awayScore} • ${room.controllerCount} players • ${room.spectatorCount} watching ${!room.joinable ? '• PRIVATE' : ''}</div>
                </div>
                <div class="room-action">${room.joinable ? 'Watch/Join →' : 'Spectate →'}</div>
            </div>
        `).join('');

        const featured = rooms[0];
        previewContainer.innerHTML = `
            <div class="preview-score-board">
                <div class="preview-team">
                    <span class="preview-team-name">${escapeHtml(featured.homeName)}</span>
                    <span class="preview-score">${featured.homeScore}</span>
                </div>
                <div class="preview-vs">vs</div>
                <div class="preview-team">
                    <span class="preview-team-name">${escapeHtml(featured.awayName)}</span>
                    <span class="preview-score">${featured.awayScore}</span>
                </div>
            </div>
            <div class="preview-meta">
                ROOM: ${escapeHtml(featured.room)} • ${featured.phase.replace('_', ' ').toUpperCase()}
            </div>
        `;
    }

    private showCareerSlotDialog(): void {
        const slots = listCareerSlots();
        const filled = slots
            .map((slot, idx) => ({ slot, idx }))
            .filter((entry) => !!entry.slot);
        if (filled.length === 0) {
            this.showNewCareerDialog();
            return;
        }
        if (filled.length === 1) {
            setActiveCareerSlot(filled[0].idx);
            this.ctx.navigate('/career');
            return;
        }

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog">
                <h2>Select Career Slot</h2>
                <div style="display:flex;flex-direction:column;gap:8px;max-height:45vh;overflow:auto;">
                    ${filled
                        .map((entry) => {
                            const career = entry.slot!;
                            return `<button class="menu-btn" data-slot="${entry.idx}">Slot ${entry.idx + 1}: ${escapeHtml(career.teamName)} (S${career.season} W${career.week})</button>`;
                        })
                        .join('')}
                </div>
                <div class="dialog-buttons" style="margin-top:12px;">
                    <button class="menu-btn" id="cancel-slot">Cancel</button>
                </div>
            </div>
        `;
        this.container?.appendChild(dialog);

        dialog.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((button) => {
            button.addEventListener('click', () => {
                const slot = Number(button.dataset.slot || 0);
                setActiveCareerSlot(slot);
                dialog.remove();
                this.ctx.navigate('/career');
            });
        });
        dialog.querySelector('#cancel-slot')?.addEventListener('click', () => dialog.remove());
    }

    private showNewCareerDialog(): void {
        const slots = listCareerSlots();
        const defaultSlot = slots.findIndex((slot) => slot === null);
        const slotValue = defaultSlot >= 0 ? defaultSlot : 0;
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog">
                <h2>Start New Career</h2>
                <label>Your Name:</label>
                <input type="text" id="player-name" placeholder="Coach" value="Coach">

                <label>Team Name:</label>
                <input type="text" id="team-name" placeholder="Lightning" value="Lightning">

                <label>Primary Color:</label>
                <input type="color" id="team-primary" value="#1a73e8">

                <label>Secondary Color:</label>
                <input type="color" id="team-secondary" value="#ffffff">

                <label>Home Region:</label>
                <select id="home-region">
                    ${CAREER_HOME_REGIONS.map((region) => `<option value="${region}">${region}</option>`).join('')}
                </select>

                <label>Difficulty:</label>
                <select id="career-difficulty">
                    <option value="easy">Easy</option>
                    <option value="normal" selected>Normal</option>
                    <option value="hard">Hard</option>
                </select>

                <label>Career Mode:</label>
                <select id="career-mode">
                    <option value="club" selected>Club Season</option>
                    <option value="college">College Season</option>
                </select>

                <label>Save Slot:</label>
                <select id="career-slot">
                    ${slots
                        .map((slot, idx) => {
                            const selected = idx === slotValue ? 'selected' : '';
                            const label = slot ? `${idx + 1}: ${escapeHtml(slot.teamName)} (Overwrite)` : `${idx + 1}: Empty`;
                            return `<option value="${idx}" ${selected}>${label}</option>`;
                        })
                        .join('')}
                </select>

                <div class="dialog-buttons">
                    <button class="menu-btn" id="cancel">Cancel</button>
                    <button class="menu-btn primary" id="create">Create</button>
                </div>
            </div>
        `;
        this.container?.appendChild(dialog);

        dialog.querySelector('#cancel')?.addEventListener('click', () => {
            dialog.remove();
        });

        dialog.querySelector('#create')?.addEventListener('click', () => {
            const playerName = (dialog.querySelector('#player-name') as HTMLInputElement).value || 'Coach';
            const teamName = (dialog.querySelector('#team-name') as HTMLInputElement).value || 'Lightning';
            const primaryColorHex =
                (dialog.querySelector('#team-primary') as HTMLInputElement).value ||
                '#1a73e8';
            const secondaryColorHex =
                (dialog.querySelector('#team-secondary') as HTMLInputElement).value ||
                '#ffffff';
            const homeRegion = (dialog.querySelector('#home-region') as HTMLSelectElement)
                .value as HomeRegion;
            const difficulty = (
                dialog.querySelector('#career-difficulty') as HTMLSelectElement
            ).value as CareerDifficulty;
            const slot = Number(
                (dialog.querySelector('#career-slot') as HTMLSelectElement).value || 0,
            );
            const mode = (
                dialog.querySelector('#career-mode') as HTMLSelectElement
            ).value;

            const career = createNewCareer(playerName, teamName, {
                mode: mode === 'college' ? 'college' : 'club',
                difficulty:
                    difficulty === 'easy' || difficulty === 'hard'
                        ? difficulty
                        : 'normal',
                homeRegion,
                primaryColor: Number.parseInt(primaryColorHex.replace('#', ''), 16),
                secondaryColor: Number.parseInt(secondaryColorHex.replace('#', ''), 16),
                slot,
            });
            setActiveCareerSlot(slot);
            saveCareer(career, slot);

            dialog.remove();
            this.ctx.navigate('/career');
        });
    }

    destroy(): void {
        this.root?.remove();
        this.root = null;
        this.container = null;
    }
}
