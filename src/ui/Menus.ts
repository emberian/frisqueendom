import {
    CAREER_HOME_REGIONS,
    saveManager,
    getDefaultSettings,
    createNewCareer,
    listCareerSlots,
    loadCareer,
    saveCareer,
    setActiveCareerSlot,
    type CareerDifficulty,
    type CareerData,
    type GameSettings,
    type SeasonEvent,
    type ScoutingReport,
} from '../data/SaveLoad';
import { XP_PER_LEVEL, UNLOCKABLES } from '../data/Progression';
import { CareerManager, type CareerSimSummary, type SimIntervention } from '../management/Career';
import { RosterManager } from '../management/Roster';
import { PlaybookEditor } from '../management/Playbook';
import { practiceManager, type DrillType } from '../gameplay/Practice';
import type { RoomMetadata } from '../network/protocol';

export type MenuState =
    | 'title'
    | 'career_menu'
    | 'match_setup'
    | 'settings'
    | 'credits'
    | 'practice_menu'
    | 'locker'
    | 'paused'
    | 'none';

export type MultiplayerMode = 'single' | 'local_split' | 'lan_remote' | 'lan_spectator';

export interface QuickMatchConfig {
    color: string;
    difficulty: string;
    gameTo: number;
    multiplayerMode: MultiplayerMode;
    spectatorMode?: boolean;
    lanServerUrl?: string;
    lanRoom?: string;
    timeOfDay?: string;
    weather?: string;
    randomSeed?: number;
}

export class MenuSystem {
    private container: HTMLElement;
    private currentState: MenuState = 'title';
    private previousState: MenuState = 'title';
    private onStateChange?: (state: MenuState) => void;
    private navigate?: (path: string, params?: Record<string, string>) => void;
    private settings: GameSettings;
    private tempSettings: GameSettings;
    private pauseMenuCallbacks: { onResume: () => void; onQuit: () => void } | null = null;

    constructor(
        container: HTMLElement,
        onStateChange?: (state: MenuState) => void,
        navigate?: (path: string, params?: Record<string, string>) => void,
    ) {
        this.container = container;
        this.onStateChange = onStateChange;
        this.navigate = navigate;
        this.settings = saveManager.getSettings();
        this.tempSettings = cloneSettings(this.settings);

        this.render();
    }

    /** Navigate via router if available. Returns true if navigated. */
    private nav(path: string, params?: Record<string, string>): boolean {
        if (this.navigate) { this.navigate(path, params); return true; }
        return false;
    }

    /** Pre-fill match setup form from URL query params. */
    setMatchSetupDefaults(config: Partial<QuickMatchConfig>): void {
        if (this.currentState !== 'match_setup') return;
        const set = (id: string, val?: string | number) => {
            if (val == null) return;
            const el = this.container.querySelector('#' + id) as HTMLSelectElement | null;
            if (el) el.value = String(val);
        };
        set('team-color', config.color);
        set('difficulty', config.difficulty);
        set('game-to', config.gameTo);
        set('time-of-day', config.timeOfDay);
        set('weather', config.weather);
        if (config.multiplayerMode) set('multiplayer-mode', config.multiplayerMode);
    }

    private getActiveMenuSettings(): GameSettings {
        return this.currentState === 'settings' ? this.tempSettings : this.settings;
    }

    private applyMenuAccessibility(settings: GameSettings): void {
        const scale = Math.max(1, Math.min(2, settings.accessibility.uiScale || 1.3));
        this.container.style.setProperty('--menu-ui-scale', scale.toFixed(3));
    }
    
    getState(): MenuState {
        return this.currentState;
    }
    
    setState(state: MenuState): void {
        if (state === 'none') {
            this.container.style.display = 'none';
        } else {
            this.container.style.display = 'flex';
        }
        
        if (state !== 'settings' && state !== 'paused') {
            this.previousState = this.currentState;
        }
        
        this.currentState = state;
        this.render();
        this.onStateChange?.(state);
    }

    private returnToPreviousState(): void {
        if (this.previousState === 'none' && this.pauseMenuCallbacks) {
            this.setState('paused');
        } else {
            this.setState(this.previousState);
        }
    }
    
    private render(): void {
        this.container.innerHTML = '';
        this.container.className = 'menu-container';
        this.applyMenuAccessibility(this.getActiveMenuSettings());
        
        switch (this.currentState) {
            case 'title':
                this.renderTitleScreen();
                break;
            case 'career_menu':
                this.renderCareerMenu();
                break;
            case 'match_setup':
                this.renderMatchSetup();
                break;
            case 'settings':
                this.renderSettings();
                break;
            case 'credits':
                this.renderCredits();
                break;
            case 'practice_menu':
                this.renderPracticeMenu();
                break;
            case 'locker':
                this.renderLockerMenu();
                break;
            case 'paused':
                this.renderPausedUI();
                break;
        }
    }
    
    private renderTitleScreen(): void {
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
        this.container.appendChild(title);
        
        title.querySelector('#quick-local')?.addEventListener('click', () => {
            if (this.navigate) {
                this.navigate('/play', { color: 'blue', difficulty: 'normal', gameTo: '15', multiplayer: 'single' });
            } else {
                window.dispatchEvent(new CustomEvent('startQuickMatch', {
                    detail: { color: 'blue', difficulty: 'normal', gameTo: 15, multiplayerMode: 'single' }
                }));
                this.setState('none');
            }
        });

        title.querySelector('#quick-online')?.addEventListener('click', () => {
            this.nav('/setup') || this.setState('match_setup');
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
            this.nav('/setup') || this.setState('match_setup');
        });

        title.querySelector('#menu-watch')?.addEventListener('click', () => {
            this.nav('/setup') || this.setState('match_setup');
        });

        title.querySelector('#menu-practice')?.addEventListener('click', () => {
            this.nav('/practice') || this.setState('practice_menu');
        });

        title.querySelector('#menu-locker')?.addEventListener('click', () => {
            this.nav('/locker') || this.setState('locker');
        });

        title.querySelector('#menu-tutorial')?.addEventListener('click', () => {
            if (!this.nav('/tutorial')) {
                this.setState('none');
                window.dispatchEvent(new CustomEvent('startTutorial'));
            }
        });

        title.querySelector('#menu-settings')?.addEventListener('click', () => {
            this.nav('/settings') || this.setState('settings');
        });

        title.querySelector('#menu-credits')?.addEventListener('click', () => {
            this.nav('/credits') || this.setState('credits');
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

        // Update List
        listContainer.innerHTML = rooms.map(room => `
            <div class="room-item" onclick="window.dispatchEvent(new CustomEvent('joinLobbyRoom', { detail: { room: '${room.room}' } }))">
                <div class="room-info">
                    <div class="room-teams">${escapeHtml(room.homeName)} vs ${escapeHtml(room.awayName)}</div>
                    <div class="room-meta">${room.homeScore} - ${room.awayScore} • ${room.controllerCount} players • ${room.spectatorCount} watching ${!room.joinable ? '• PRIVATE' : ''}</div>
                </div>
                <div class="room-action">${room.joinable ? 'Watch/Join →' : 'Spectate →'}</div>
            </div>
        `).join('');

        // Update Featured Preview (first room)
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
    
    private renderCareerMenu(): void {
        const career = loadCareer();
        if (!career) {
            this.nav('/title') || this.setState('title');
            return;
        }

        const manager = CareerManager.load(career.careerSlot);
        if (!manager) {
            this.nav('/title') || this.setState('title');
            return;
        }

        const currentEvent = career.schedule.find((event) => event.date === career.week) || null;
        let actionLabel = 'Advance Event';
        let actionHint = 'No scheduled event this week.';
        if (currentEvent?.type === 'tournament') {
            actionLabel = `Play ${currentEvent.title}`;
            const gateReason = manager.getCurrentEventGateReason(currentEvent);
            actionHint = gateReason
                ? `Locked: ${gateReason}`
                : `${currentEvent.opponent.teamName} (${currentEvent.opponent.rating} OVR • ${currentEvent.opponent.difficulty})`;
        } else if (currentEvent?.type === 'practice') {
            actionLabel = 'Run Practice';
            actionHint = `${currentEvent.title} • Suggested focus: ${currentEvent.focus}`;
        } else if (currentEvent?.type === 'rest') {
            actionLabel = 'Take Rest Week';
            actionHint = currentEvent.title;
        } else if (currentEvent?.type === 'tryout') {
            actionLabel =
                currentEvent.stage === 'announce'
                    ? 'Post Tryout Announcement'
                    : currentEvent.stage === 'drill'
                    ? 'Run Tryout Drill'
                    : 'Offer Roster Spots';
            actionHint = `${currentEvent.title} • ${currentEvent.stage.toUpperCase()}`;
        } else if (currentEvent?.type === 'scouting') {
            actionLabel = 'Scout Opponent';
            actionHint = currentEvent.title;
        } else if (currentEvent?.type === 'bonding') {
            actionLabel = 'Run Team Bonding';
            actionHint = `${currentEvent.title} • ${currentEvent.effect.toUpperCase()} focus`;
        }
        
        const menu = document.createElement('div');
        menu.className = 'career-menu';
        menu.innerHTML = `
            <h1>${career.teamName}</h1>
            <p class="menu-subtitle">Event-driven season mode.</p>
            <div class="career-stats">
                <p>Season ${career.season}, Week ${career.week}</p>
                <p>${career.mode === 'college' ? `College Year ${career.collegeYear}` : `Division ${career.division}`} • ${escapeHtml(career.homeRegion)} • ${career.difficulty.toUpperCase()}</p>
                <p>Phase: ${career.seasonPhase.toUpperCase()} • Rank #${manager.getCurrentRank()}</p>
                <p>Record: ${career.team.stats.wins}-${career.team.stats.losses}</p>
                <p>Points: ${career.team.stats.pointsFor}-${career.team.stats.pointsAgainst}</p>
                <p>Spirit: ${career.team.stats.spiritScore.toFixed(1)}/10</p>
                <p>Budget: $${career.finances.budget.toLocaleString()}</p>
                <p>Captains: ${career.captainIds.length} • Mentorships: ${career.mentorships.length} • Prestige: ${career.prestigeLevel}</p>
                <p>Line Setting: O ${career.team.offenseLineupIds?.length || 0}/7 • D ${career.team.defenseLineupIds?.length || 0}/7</p>
                <p>Slot: ${career.careerSlot + 1}/3</p>
            </div>
            <div style="margin:10px 0 12px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.55);">
                <p style="margin:0;font-size:12px;color:#9fb6d4;text-transform:uppercase;letter-spacing:0.08em;">Current Event</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:600;">${escapeHtml(currentEvent?.title || 'Open Week')}</p>
                <p style="margin:2px 0 0;font-size:13px;color:#c8d7ee;">${escapeHtml(actionHint)}</p>
            </div>
            <div class="menu-buttons">
                <button class="menu-btn primary" id="primary-action">${escapeHtml(actionLabel)}</button>
                <button class="menu-btn" id="auto-event">Auto-Resolve Event</button>
                <button class="menu-btn" id="roster">Roster</button>
                <button class="menu-btn" id="playbook">Playbook</button>
                <button class="menu-btn" id="schedule">Schedule</button>
                <button class="menu-btn" id="tryouts">Tryouts</button>
                <button class="menu-btn" id="scouting">Scouting</button>
                <button class="menu-btn" id="spirit">Spirit Dashboard</button>
                <button class="menu-btn" id="milestones">Milestones</button>
                <button class="menu-btn" id="profile">Profile</button>
                <button class="menu-btn" id="back">Back to Main</button>
            </div>
        `;
        this.container.appendChild(menu);
        
        menu.querySelector('#primary-action')?.addEventListener('click', () => {
            const event = manager.getCurrentEvent();
            if (event?.type === 'tournament') {
                const gate = manager.getCurrentEventGateReason(event);
                if (gate) {
                    alert(gate);
                    return;
                }
                setActiveCareerSlot(manager.data.careerSlot);
                this.setState('none');
                window.dispatchEvent(new CustomEvent('startCareerMatch'));
                return;
            }
            if (event?.type === 'practice') {
                this.showTrainingScreen();
                return;
            }
            if (event?.type === 'rest') {
                const outcome = manager.takeRestWeek();
                if (!outcome.ok) {
                    alert(outcome.reason || 'Unable to take a rest week right now.');
                }
                this.render();
                return;
            }
            if (event?.type === 'tryout') {
                this.showTryoutScreen(career);
                return;
            }
            if (event?.type === 'scouting') {
                this.showScoutingScreen(career);
                return;
            }
            if (event?.type === 'bonding') {
                const outcome = manager.runBondingEvent();
                if (!outcome.ok) {
                    alert(outcome.reason || 'Unable to run bonding event.');
                }
                this.render();
                return;
            }
            alert('No scheduled event this week.');
        });

        menu.querySelector('#auto-event')?.addEventListener('click', () => {
            const event = manager.getCurrentEvent();
            const interventions: SimIntervention[] = [];
            if (event?.type === 'tournament') {
                if (confirm('Call a timeout during simulation for a momentum boost?')) {
                    interventions.push({ type: 'timeout', atPoint: 8 });
                }
            }
            const outcome = manager.runCurrentEventAuto(interventions);
            if (!outcome.ok) {
                alert(outcome.reason || 'Unable to auto-resolve this event.');
                return;
            }
            if (event?.type === 'tournament' && outcome.data) {
                this.showSimulationSummaryDialog(outcome.data as CareerSimSummary);
            } else if (event?.type === 'scouting' && outcome.data) {
                const report = outcome.data as ScoutingReport;
                alert(
                    `Scouting report ready: ${report.teamName}\nStrengths: ${report.strengths.join(', ')}\nWeaknesses: ${report.weaknesses.join(', ')}`,
                );
            } else {
                alert('Event resolved.');
            }
            this.render();
        });
        
        menu.querySelector('#roster')?.addEventListener('click', () => {
            this.showRosterScreen();
        });
        
        menu.querySelector('#playbook')?.addEventListener('click', () => {
            this.showPlaybookScreen();
        });
        
        menu.querySelector('#schedule')?.addEventListener('click', () => {
            this.showScheduleScreen();
        });
        
        menu.querySelector('#tryouts')?.addEventListener('click', () => {
            this.showTryoutScreen(career);
        });

        menu.querySelector('#scouting')?.addEventListener('click', () => {
            this.showScoutingScreen(career);
        });

        menu.querySelector('#spirit')?.addEventListener('click', () => {
            this.showSpiritDashboard(career);
        });

        menu.querySelector('#milestones')?.addEventListener('click', () => {
            this.showMilestonesScreen(career);
        });

        menu.querySelector('#profile')?.addEventListener('click', () => {
            this.showProfileScreen(career);
        });
        
        menu.querySelector('#back')?.addEventListener('click', () => {
            this.nav('/title') || this.setState('title');
        });
    }

    private renderMatchSetup(): void {
        const menu = document.createElement('div');
        menu.className = 'match-setup';
        const defaultLanUrl =
            window.location.hostname === 'localhost'
                ? 'ws://localhost:8787/ws'
                : `wss://${window.location.host}/ws`;
        menu.innerHTML = `
            <h1>Quick Match</h1>
            <p class="menu-subtitle">Set the vibe, then launch the point.</p>
            <div class="setup-options">
                <label>Your Team Color:</label>
                <select id="team-color">
                    <option value="blue">Blue</option>
                    <option value="red">Red</option>
                    <option value="green">Green</option>
                    <option value="yellow">Yellow</option>
                </select>
                
                <label>Opponent Difficulty:</label>
                <select id="difficulty">
                    <option value="easy">Easy</option>
                    <option value="normal" selected>Normal</option>
                    <option value="hard">Hard</option>
                </select>
                
                <label>Game to:</label>
                <select id="game-to">
                    <option value="7">7 points</option>
                    <option value="11">11 points</option>
                    <option value="15" selected>15 points</option>
                </select>

                <label>Time of Day:</label>
                <select id="time-of-day">
                    <option value="morning">Morning</option>
                    <option value="midday" selected>Midday</option>
                    <option value="golden_hour">Golden Hour</option>
                    <option value="sunset">Sunset</option>
                    <option value="night">Night</option>
                </select>

                <label>Weather:</label>
                <select id="weather">
                    <option value="clear" selected>Clear</option>
                    <option value="overcast">Overcast</option>
                    <option value="rain">Rain</option>
                    <option value="cold">Cold</option>
                    <option value="hot">Hot</option>
                </select>

                <label>Multiplayer:</label>
                <select id="multiplayer-mode">
                    <option value="single" selected>Single Player</option>
                    <option value="local_split">Local Split-Screen (2 Players)</option>
                    <option value="lan_remote">LAN Remote Controller (Player 2)</option>
                    <option value="lan_spectator">Join Live Match (Spectator)</option>
                </select>

                <div id="lan-options" style="display:none;">
                    <label id="lan-url-label">LAN Relay WebSocket URL:</label>
                    <input type="text" id="lan-server-url" value="${defaultLanUrl}" />

                    <label id="lan-room-label">Room Code:</label>
                    <input type="text" id="lan-room" value="fqd-room-1" />

                    <label id="lan-preview-label">Controller Link:</label>
                    <input type="text" id="controller-url-preview" readonly />
                </div>
            </div>
            <div class="menu-buttons">
                <button class="menu-btn primary" id="start-match">Start Match</button>
                <button class="menu-btn" id="watch-sim">Watch Sim</button>
                <button class="menu-btn" id="back">Back</button>
            </div>
        `;
        this.container.appendChild(menu);

        const multiplayerModeEl = menu.querySelector(
            '#multiplayer-mode',
        ) as HTMLSelectElement;
        const lanOptionsEl = menu.querySelector('#lan-options') as HTMLDivElement;
        const lanUrlInput = menu.querySelector('#lan-server-url') as HTMLInputElement;
        const lanRoomInput = menu.querySelector('#lan-room') as HTMLInputElement;
        const controllerPreviewInput = menu.querySelector(
            '#controller-url-preview',
        ) as HTMLInputElement;
        const updateControllerPreview = () => {
            const relay = encodeURIComponent(lanUrlInput.value.trim());
            const room = encodeURIComponent(lanRoomInput.value.trim() || 'fqd-room-1');
            controllerPreviewInput.value = `${window.location.origin}/controller.html?relay=${relay}&room=${room}`;
        };
        const updateMultiplayerVisibility = () => {
            const isLan = multiplayerModeEl.value === 'lan_remote' || multiplayerModeEl.value === 'lan_spectator';
            lanOptionsEl.style.display = isLan ? 'block' : 'none';
            
            const isSpectator = multiplayerModeEl.value === 'lan_spectator';
            const previewLabel = menu.querySelector('#lan-preview-label') as HTMLElement;
            if (previewLabel) previewLabel.style.display = isSpectator ? 'none' : 'block';
            if (controllerPreviewInput) controllerPreviewInput.style.display = isSpectator ? 'none' : 'block';
        };
        lanUrlInput.addEventListener('input', updateControllerPreview);
        lanRoomInput.addEventListener('input', updateControllerPreview);
        updateControllerPreview();
        multiplayerModeEl.addEventListener('change', updateMultiplayerVisibility);
        updateMultiplayerVisibility();
        
        menu.querySelector('#start-match')?.addEventListener('click', () => {
            const color = (menu.querySelector('#team-color') as HTMLSelectElement).value;
            const difficulty = (menu.querySelector('#difficulty') as HTMLSelectElement).value;
            const gameTo = parseInt((menu.querySelector('#game-to') as HTMLSelectElement).value);
            const timeOfDay = (menu.querySelector('#time-of-day') as HTMLSelectElement).value;
            const weather = (menu.querySelector('#weather') as HTMLSelectElement).value;
            const multiplayerMode = (menu.querySelector(
                '#multiplayer-mode',
            ) as HTMLSelectElement).value as MultiplayerMode;
            const lanServerUrl = lanUrlInput.value.trim();
            const lanRoom = lanRoomInput.value
                .trim()
                .slice(0, 64);

            if (this.navigate) {
                const p: Record<string, string> = { color, difficulty, gameTo: String(gameTo) };
                if (multiplayerMode !== 'single') p.multiplayer = multiplayerMode;
                if (timeOfDay) p.time = timeOfDay;
                if (weather) p.weather = weather;
                if (multiplayerMode === 'lan_remote') {
                    if (lanServerUrl) p.relay = lanServerUrl;
                    p.room = lanRoom || 'fqd-room-1';
                }
                this.navigate('/play', p);
                return;
            }

            this.setState('none');
            const detail: QuickMatchConfig = {
                color,
                difficulty,
                gameTo,
                multiplayerMode,
                timeOfDay,
                weather,
            };
            if (multiplayerMode === 'lan_remote') {
                detail.lanServerUrl = lanServerUrl;
                detail.lanRoom = lanRoom || 'fqd-room-1';
            }
            window.dispatchEvent(
                new CustomEvent('startQuickMatch', {
                    detail,
                }),
            );
        });

        menu.querySelector('#watch-sim')?.addEventListener('click', () => {
            const color = (menu.querySelector('#team-color') as HTMLSelectElement).value;
            const difficulty = (menu.querySelector('#difficulty') as HTMLSelectElement).value;
            const gameTo = parseInt((menu.querySelector('#game-to') as HTMLSelectElement).value);
            const timeOfDay = (menu.querySelector('#time-of-day') as HTMLSelectElement).value;
            const weather = (menu.querySelector('#weather') as HTMLSelectElement).value;

            if (this.navigate) {
                const p: Record<string, string> = { color, difficulty, gameTo: String(gameTo) };
                if (timeOfDay) p.time = timeOfDay;
                if (weather) p.weather = weather;
                this.navigate('/watch', p);
                return;
            }

            this.setState('none');
            const detail: QuickMatchConfig = {
                color,
                difficulty,
                gameTo,
                multiplayerMode: 'single',
                spectatorMode: true,
                timeOfDay,
                weather,
            };
            window.dispatchEvent(
                new CustomEvent('startSpectatorMatch', {
                    detail,
                }),
            );
        });

        menu.querySelector('#back')?.addEventListener('click', () => {
            this.nav('/title') || this.setState('title');
        });
    }
    
    private renderSettings(): void {
        const settings = this.tempSettings;
        
        const menu = document.createElement('div');
        menu.className = 'settings-menu';
        menu.innerHTML = `
            <h1>Settings</h1>
            <p class="menu-subtitle">Tune your controls, visuals, and feel.</p>
            
            <div class="settings-section">
                <h2>Audio</h2>
                <label>Master Volume: <span>${Math.round(settings.audio.masterVolume * 100)}%</span></label>
                <input type="range" id="master-vol" min="0" max="100" value="${settings.audio.masterVolume * 100}">
                
                <label>Music Volume: <span>${Math.round(settings.audio.musicVolume * 100)}%</span></label>
                <input type="range" id="music-vol" min="0" max="100" value="${settings.audio.musicVolume * 100}">
                
                <label>SFX Volume: <span>${Math.round(settings.audio.sfxVolume * 100)}%</span></label>
                <input type="range" id="sfx-vol" min="0" max="100" value="${settings.audio.sfxVolume * 100}">
            </div>
            
            <div class="settings-section">
                <h2>Graphics</h2>
                <label>Quality:</label>
                <select id="graphics-quality">
                    <option value="low" ${settings.graphics.quality === 'low' ? 'selected' : ''}>Low</option>
                    <option value="medium" ${settings.graphics.quality === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="high" ${settings.graphics.quality === 'high' ? 'selected' : ''}>High</option>
                </select>
                
                <label class="checkbox">
                    <input type="checkbox" id="shadows" ${settings.graphics.shadows ? 'checked' : ''}>
                    Shadows
                </label>
                
                <label class="checkbox">
                    <input type="checkbox" id="particles" ${settings.graphics.particles ? 'checked' : ''}>
                    Particles
                </label>
            </div>
            
            <div class="settings-section">
                <h2>Gameplay</h2>
                <label class="checkbox">
                    <input type="checkbox" id="auto-switch" ${settings.gameplay.autoSwitchOnCatch ? 'checked' : ''}>
                    Auto-switch player on catch
                </label>

                <label class="checkbox">
                    <input type="checkbox" id="show-trajectory" ${settings.gameplay.showTrajectory ? 'checked' : ''}>
                    Show throw trajectory
                </label>
            </div>

            <div class="settings-section">
                <h2>Accessibility</h2>
                <label>Color Blind Mode:</label>
                <select id="color-blind-mode">
                    <option value="none" ${settings.accessibility.colorBlindMode === 'none' ? 'selected' : ''}>None</option>
                    <option value="protanopia" ${settings.accessibility.colorBlindMode === 'protanopia' ? 'selected' : ''}>Protanopia (Red-blind)</option>
                    <option value="deuteranopia" ${settings.accessibility.colorBlindMode === 'deuteranopia' ? 'selected' : ''}>Deuteranopia (Green-blind)</option>
                    <option value="tritanopia" ${settings.accessibility.colorBlindMode === 'tritanopia' ? 'selected' : ''}>Tritanopia (Blue-blind)</option>
                </select>

                <label>UI Scale: <span id="ui-scale-value">${Math.round(settings.accessibility.uiScale * 100)}%</span></label>
                <input type="range" id="ui-scale" min="100" max="200" step="5" value="${Math.round(
                    settings.accessibility.uiScale * 100,
                )}">

                <label class="checkbox">
                    <input type="checkbox" id="high-contrast" ${settings.accessibility.highContrast ? 'checked' : ''}>
                    High Contrast
                </label>

                <label class="checkbox">
                    <input type="checkbox" id="reduced-motion" ${settings.accessibility.reducedMotion ? 'checked' : ''}>
                    Reduced Motion
                </label>
            </div>
            
            <div class="menu-buttons">
                <button class="menu-btn primary" id="save-settings">Save</button>
                <button class="menu-btn" id="cancel-settings">Cancel</button>
                <button class="menu-btn" id="reset-settings">Reset to Default</button>
                <button class="menu-btn" id="export-save">Export Save</button>
                <button class="menu-btn" id="import-save">Import Save</button>
                <button class="menu-btn danger" id="delete-save">Delete All Progress</button>
            </div>
        `;
        this.container.appendChild(menu);
        
        // Volume sliders
        const updateVolDisplay = (id: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume') => {
            const slider = menu.querySelector(`#${id}`) as HTMLInputElement;
            const display = slider?.previousElementSibling?.querySelector('span');
            slider?.addEventListener('input', () => {
                if (display) display.textContent = `${slider.value}%`;
                settings.audio[key] = parseInt(slider.value) / 100;
            });
        };
        updateVolDisplay('master-vol', 'masterVolume');
        updateVolDisplay('music-vol', 'musicVolume');
        updateVolDisplay('sfx-vol', 'sfxVolume');
        
        // Graphics
        menu.querySelector('#graphics-quality')?.addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value;
            if (['low', 'medium', 'high'].includes(value)) {
                settings.graphics.quality = value as 'low' | 'medium' | 'high';
            }
        });
        
        menu.querySelector('#shadows')?.addEventListener('change', (e) => {
            settings.graphics.shadows = (e.target as HTMLInputElement).checked;
        });
        
        menu.querySelector('#particles')?.addEventListener('change', (e) => {
            settings.graphics.particles = (e.target as HTMLInputElement).checked;
        });
        
        // Gameplay
        menu.querySelector('#auto-switch')?.addEventListener('change', (e) => {
            settings.gameplay.autoSwitchOnCatch = (e.target as HTMLInputElement).checked;
        });
        
        menu.querySelector('#show-trajectory')?.addEventListener('change', (e) => {
            settings.gameplay.showTrajectory = (e.target as HTMLInputElement).checked;
        });

        // Accessibility
        menu.querySelector('#color-blind-mode')?.addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value;
            if (['none', 'protanopia', 'deuteranopia', 'tritanopia'].includes(value)) {
                settings.accessibility.colorBlindMode = value as 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
            }
        });
        menu.querySelector('#high-contrast')?.addEventListener('change', (e) => {
            settings.accessibility.highContrast = (e.target as HTMLInputElement).checked;
        });
        const uiScaleSlider = menu.querySelector('#ui-scale') as HTMLInputElement | null;
        const uiScaleValue = menu.querySelector('#ui-scale-value');
        uiScaleSlider?.addEventListener('input', () => {
            const value = Math.max(100, Math.min(200, parseInt(uiScaleSlider.value, 10) || 130));
            settings.accessibility.uiScale = value / 100;
            settings.accessibility.largeText = settings.accessibility.uiScale >= 1.2;
            if (uiScaleValue) uiScaleValue.textContent = `${value}%`;
            this.applyMenuAccessibility(settings);
        });
        menu.querySelector('#reduced-motion')?.addEventListener('change', (e) => {
            settings.accessibility.reducedMotion = (e.target as HTMLInputElement).checked;
        });
        
        // Buttons
        menu.querySelector('#save-settings')?.addEventListener('click', () => {
            this.settings = cloneSettings(this.tempSettings);
            saveManager.saveSettings(this.settings);
            this.returnToPreviousState();
        });
        
        menu.querySelector('#cancel-settings')?.addEventListener('click', () => {
            this.tempSettings = cloneSettings(this.settings);
            this.returnToPreviousState();
        });
        
        menu.querySelector('#reset-settings')?.addEventListener('click', () => {
            this.tempSettings = getDefaultSettings();
            this.render();
        });

        menu.querySelector('#export-save')?.addEventListener('click', () => {
            const payload = saveManager.exportSave();
            if (!payload) {
                alert('No save data available to export.');
                return;
            }
            const blob = new Blob([payload], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `frisqueendom-save-${new Date().toISOString().slice(0, 10)}.txt`;
            anchor.click();
            URL.revokeObjectURL(url);
        });

        menu.querySelector('#import-save')?.addEventListener('click', () => {
            const pasted = prompt('Paste exported save string:');
            if (!pasted) return;
            const ok = saveManager.importSave(pasted.trim());
            if (!ok) {
                alert('Import failed. Please verify the save string.');
                return;
            }
            alert('Save imported successfully.');
            this.render();
        });

        menu.querySelector('#delete-save')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete all save data? This cannot be undone.')) {
                saveManager.deleteSave();
                this.settings = getDefaultSettings();
                this.tempSettings = getDefaultSettings();
                this.nav('/title') || this.setState('title');
            }
        });
    }
    
    private renderCredits(): void {
        const credits = document.createElement('div');
        credits.className = 'credits';
        credits.innerHTML = `
            <h1>Credits</h1>
            <p class="menu-subtitle">Made for backyard legends and future captains.</p>
            <div class="credits-content">
                <h2>FrisQueendom</h2>
                <p>A browser-based ultimate frisbee game</p>
                
                <h3>Design & Development</h3>
                <p>Built with Three.js and Rust/WASM</p>
                
                <h3>Physics</h3>
                <p>Custom disc flight simulation</p>
                <p>Inspired by real ultimate frisbee physics</p>
                
                <h3>Special Thanks</h3>
                <p>The ultimate frisbee community</p>
                <p>Disc golf flight physics research</p>
                
                <p class="copyright">© 2024 FrisQueendom Project</p>
            </div>
            <button class="menu-btn" id="back">Back</button>
        `;
        this.container.appendChild(credits);
        
        credits.querySelector('#back')?.addEventListener('click', () => {
            this.nav('/title') || this.setState('title');
        });
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
            this.nav('/career') || this.setState('career_menu');
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
        this.container.appendChild(dialog);

        dialog.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((button) => {
            button.addEventListener('click', () => {
                const slot = Number(button.dataset.slot || 0);
                setActiveCareerSlot(slot);
                dialog.remove();
                this.nav('/career') || this.setState('career_menu');
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
        this.container.appendChild(dialog);
        
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
                .value as any;
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
            this.nav('/career') || this.setState('career_menu');
        });
    }

    private showRosterScreen(): void {
        const career = loadCareer();
        if (!career) return;
        const manager = CareerManager.load(career.careerSlot);
        if (!manager) return;

        const ensureLineup = (ids: string[], rosterIds: string[]): string[] => {
            const unique = new Set<string>();
            const lineup: string[] = [];
            for (const id of ids) {
                if (!rosterIds.includes(id) || unique.has(id)) continue;
                unique.add(id);
                lineup.push(id);
                if (lineup.length >= 7) break;
            }
            for (const id of rosterIds) {
                if (lineup.length >= 7) break;
                if (unique.has(id)) continue;
                unique.add(id);
                lineup.push(id);
            }
            return lineup.slice(0, 7);
        };

        let sortBy: 'overall' | 'role' | 'stamina' | 'morale' = 'overall';
        let offenseLineupIds = ensureLineup(
            career.team.offenseLineupIds || career.team.startingLineupIds || [],
            career.team.roster.map((player) => player.id),
        );
        let defenseLineupIds = ensureLineup(
            career.team.defenseLineupIds || career.team.startingLineupIds || [],
            career.team.roster.map((player) => player.id),
        );

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';

        const render = () => {
            const refreshed = loadCareer(career.careerSlot);
            if (!refreshed) return;
            const workingCareer = refreshed;
            const rosterManager = new RosterManager(workingCareer);
            const rosterIds = workingCareer.team.roster.map((player) => player.id);
            offenseLineupIds = ensureLineup(offenseLineupIds, rosterIds);
            defenseLineupIds = ensureLineup(defenseLineupIds, rosterIds);

            const sorted = rosterManager.sortRoster(sortBy);
            const buildLineRows = (
                lineType: 'offense' | 'defense',
                lineupIds: string[],
                title: string,
            ) =>
                lineupIds
                .map((playerId, idx) => {
                    const selected = workingCareer.team.roster.find((p) => p.id === playerId);
                    const options = sorted
                        .map((player) => {
                            const selectedAttr = player.id === playerId ? 'selected' : '';
                            return `<option value="${player.id}" ${selectedAttr}>${escapeHtml(player.fullName)} (${player.role}, OVR ${player.overallRating})</option>`;
                        })
                        .join('');
                    return `
<tr>
  <td style="padding:6px 8px;">${title} ${idx + 1}</td>
  <td style="padding:6px 8px;">${selected ? escapeHtml(selected.role) : '-'}</td>
  <td style="padding:6px 8px;">
    <select data-lineup-slot="${idx}" data-lineup-type="${lineType}" style="width:100%;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
      ${options}
    </select>
  </td>
</tr>`;
                })
                .join('');
            const offenseRows = buildLineRows('offense', offenseLineupIds, 'O');
            const defenseRows = buildLineRows('defense', defenseLineupIds, 'D');

            const rosterRows = sorted
                .map(
                    (player) => `
<tr>
  <td style="padding:6px 8px;">${escapeHtml(player.fullName)}</td>
  <td style="padding:6px 8px;">${escapeHtml(player.role)}</td>
  <td style="padding:6px 8px;text-align:center;">${offenseLineupIds.includes(player.id) ? 'O' : ''}${defenseLineupIds.includes(player.id) ? 'D' : ''}</td>
  <td style="padding:6px 8px;text-align:right;">${player.overallRating}</td>
  <td style="padding:6px 8px;text-align:right;">${player.attributes.stamina.toFixed(0)}</td>
  <td style="padding:6px 8px;text-align:right;">${player.morale.toFixed(0)}</td>
  <td style="padding:6px 8px;text-align:center;">
    <button class="menu-btn small" data-captain-toggle="${player.id}">
      ${workingCareer.captainIds.includes(player.id) ? 'Captain' : 'Set'}
    </button>
  </td>
</tr>`,
                )
                .join('');

            const recommendations = rosterManager
                .getTrainingRecommendations()
                .slice(0, 2)
                .map((r) => `${escapeHtml(r.focus)}: ${escapeHtml(r.reason)}`)
                .join(' • ');

            const mentorshipRows = (workingCareer.mentorships || [])
                .map((pair) => {
                    const mentor = workingCareer.team.roster.find(
                        (player) => player.id === pair.mentorId,
                    );
                    const mentee = workingCareer.team.roster.find(
                        (player) => player.id === pair.menteeId,
                    );
                    if (!mentor || !mentee) return '';
                    return `
<tr>
  <td style="padding:6px 8px;">${escapeHtml(mentor.fullName)}</td>
  <td style="padding:6px 8px;">${escapeHtml(mentee.fullName)}</td>
  <td style="padding:6px 8px;text-align:right;">${pair.sessions}</td>
  <td style="padding:6px 8px;text-align:right;">${manager.getChemistry(mentor.id, mentee.id).toFixed(1)}</td>
  <td style="padding:6px 8px;"><button class="menu-btn small danger" data-remove-mentee="${mentee.id}">Remove</button></td>
</tr>`;
                })
                .filter((row) => row.length > 0)
                .join('');

            const mentorOptions = workingCareer.team.roster
                .slice()
                .sort(
                    (a, b) =>
                        b.development.age +
                        b.career.gamesPlayed * 0.05 -
                        (a.development.age + a.career.gamesPlayed * 0.05),
                )
                .map(
                    (player) =>
                        `<option value="${player.id}">${escapeHtml(player.fullName)} (${player.development.age}y, ${player.career.gamesPlayed} gp)</option>`,
                )
                .join('');
            const menteeOptions = workingCareer.team.roster
                .slice()
                .sort(
                    (a, b) =>
                        a.development.age + a.career.gamesPlayed * 0.02 -
                        (b.development.age + b.career.gamesPlayed * 0.02),
                )
                .map(
                    (player) =>
                        `<option value="${player.id}">${escapeHtml(player.fullName)} (${player.development.age}y)</option>`,
                )
                .join('');

            dialog.innerHTML = `
<div class="dialog wide" style="max-width:min(960px,95vw);">
  <h2>Roster And Lineup (${career.team.roster.length} players)</h2>
  <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Set dedicated offense and defense lines, assign captains, and run mentorship pairings.</p>

  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;max-height:72vh;overflow:auto;padding-right:4px;">
    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
      <h3 style="margin:0 0 8px;">Offense Line (Receiving)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr><th style="padding:6px 8px;text-align:left;">Slot</th><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:left;">Player</th></tr></thead>
        <tbody>${offenseRows}</tbody>
      </table>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="menu-btn" id="lineup-auto-offense">Auto O-Line</button>
      </div>
    </section>

    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
      <h3 style="margin:0 0 8px;">Defense Line (Pulling)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr><th style="padding:6px 8px;text-align:left;">Slot</th><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:left;">Player</th></tr></thead>
        <tbody>${defenseRows}</tbody>
      </table>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="menu-btn" id="lineup-auto-defense">Auto D-Line</button>
        <button class="menu-btn primary" id="lineup-save">Save Lines</button>
      </div>
    </section>

    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);grid-column:1 / span 2;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <h3 style="margin:0;">Full Roster</h3>
        <label style="font-size:12px;">Sort
          <select id="roster-sort" style="margin-left:6px;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
            <option value="overall" ${sortBy === 'overall' ? 'selected' : ''}>Overall</option>
            <option value="role" ${sortBy === 'role' ? 'selected' : ''}>Role</option>
            <option value="stamina" ${sortBy === 'stamina' ? 'selected' : ''}>Stamina</option>
            <option value="morale" ${sortBy === 'morale' ? 'selected' : ''}>Morale</option>
          </select>
        </label>
      </div>
      <div style="margin-top:8px;max-height:350px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr><th style="padding:6px 8px;text-align:left;">Player</th><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:center;">Line</th><th style="padding:6px 8px;text-align:right;">OVR</th><th style="padding:6px 8px;text-align:right;">STA</th><th style="padding:6px 8px;text-align:right;">MOR</th><th style="padding:6px 8px;text-align:center;">Captain</th></tr></thead>
          <tbody>${rosterRows}</tbody>
        </table>
      </div>
      <p style="margin:10px 0 0;color:#9fb6d4;font-size:12px;">${recommendations || 'No training recommendation right now.'}</p>
    </section>

    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);grid-column:1 / span 2;">
      <h3 style="margin:0 0 8px;">Mentoring</h3>
      <p style="margin:0 0 8px;color:#9fb6d4;font-size:12px;">Pair veterans with younger players to boost development during training weeks.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <label style="font-size:12px;flex:1;min-width:200px;">Mentor
          <select id="mentor-select" style="width:100%;margin-top:4px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">${mentorOptions}</select>
        </label>
        <label style="font-size:12px;flex:1;min-width:200px;">Mentee
          <select id="mentee-select" style="width:100%;margin-top:4px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">${menteeOptions}</select>
        </label>
        <button class="menu-btn" id="mentorship-add">Assign Pair</button>
      </div>
      <div style="margin-top:8px;max-height:180px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr><th style="padding:6px 8px;text-align:left;">Mentor</th><th style="padding:6px 8px;text-align:left;">Mentee</th><th style="padding:6px 8px;text-align:right;">Sessions</th><th style="padding:6px 8px;text-align:right;">Chem</th><th style="padding:6px 8px;text-align:left;">Action</th></tr></thead>
          <tbody>${mentorshipRows || '<tr><td colspan="5" style="padding:8px;">No mentorships assigned.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  </div>

  <div style="margin-top:12px;display:flex;justify-content:flex-end;">
    <button class="menu-btn" id="close">Close</button>
  </div>
</div>`;

            dialog.querySelectorAll<HTMLSelectElement>('select[data-lineup-slot]').forEach((selectEl) => {
                selectEl.addEventListener('change', () => {
                    const slot = Number(selectEl.dataset.lineupSlot ?? -1);
                    const lineupType = selectEl.dataset.lineupType === 'defense' ? 'defense' : 'offense';
                    if (slot < 0) return;
                    const nextId = selectEl.value;
                    const target = lineupType === 'offense' ? offenseLineupIds : defenseLineupIds;
                    const duplicateIndex = target.findIndex(
                        (id, idx) => id === nextId && idx !== slot,
                    );
                    if (duplicateIndex >= 0) {
                        target[duplicateIndex] = target[slot];
                    }
                    target[slot] = nextId;
                    render();
                });
            });

            dialog.querySelector('#roster-sort')?.addEventListener('change', (event) => {
                const value = (event.target as HTMLSelectElement).value;
                if (value === 'overall' || value === 'role' || value === 'stamina' || value === 'morale') {
                    sortBy = value;
                    render();
                }
            });

            dialog.querySelector('#lineup-auto-offense')?.addEventListener('click', () => {
                offenseLineupIds = [...workingCareer.team.roster]
                    .sort(
                        (a, b) =>
                            b.attributes.throwAccuracy +
                            b.attributes.awareness +
                            b.attributes.catching -
                            (a.attributes.throwAccuracy +
                                a.attributes.awareness +
                                a.attributes.catching),
                    )
                    .slice(0, 7)
                    .map((player) => player.id);
                render();
            });

            dialog.querySelector('#lineup-auto-defense')?.addEventListener('click', () => {
                defenseLineupIds = [...workingCareer.team.roster]
                    .sort(
                        (a, b) =>
                            b.attributes.marking + b.attributes.speed + b.attributes.stamina -
                            (a.attributes.marking + a.attributes.speed + a.attributes.stamina),
                    )
                    .slice(0, 7)
                    .map((player) => player.id);
                render();
            });

            dialog.querySelector('#lineup-save')?.addEventListener('click', () => {
                const outcome = manager.setLineups(offenseLineupIds, defenseLineupIds);
                if (!outcome.ok) {
                    alert(outcome.reason || 'Unable to save line assignments.');
                    return;
                }
                this.render();
                dialog.remove();
            });

            dialog.querySelectorAll<HTMLButtonElement>('[data-captain-toggle]').forEach((button) => {
                button.addEventListener('click', () => {
                    const playerId = button.dataset.captainToggle;
                    if (!playerId) return;
                    const isCaptain = career.captainIds.includes(playerId);
                    const result = manager.setCaptain(playerId, !isCaptain);
                    if (!result.ok) {
                        alert(result.reason || 'Unable to update captain.');
                        return;
                    }
                    render();
                });
            });

            dialog.querySelector('#mentorship-add')?.addEventListener('click', () => {
                const mentorId =
                    (dialog.querySelector('#mentor-select') as HTMLSelectElement | null)
                        ?.value || '';
                const menteeId =
                    (dialog.querySelector('#mentee-select') as HTMLSelectElement | null)
                        ?.value || '';
                const outcome = manager.assignMentorship(mentorId, menteeId);
                if (!outcome.ok) {
                    alert(outcome.reason || 'Unable to assign mentorship.');
                }
                render();
            });

            dialog.querySelectorAll<HTMLButtonElement>('[data-remove-mentee]').forEach((button) => {
                button.addEventListener('click', () => {
                    const menteeId = button.dataset.removeMentee;
                    if (!menteeId) return;
                    const outcome = manager.removeMentorship(menteeId);
                    if (!outcome.ok) {
                        alert(outcome.reason || 'Unable to remove mentorship.');
                    }
                    render();
                });
            });

            dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
        };

        this.container.appendChild(dialog);
        render();
    }
    
    private showPlaybookScreen(): void {
        const career = loadCareer();
        if (!career) return;
        const manager = CareerManager.load(career.careerSlot);
        if (!manager) return;

        const editor = new PlaybookEditor(career.playbook);
        const customPlaybookUnlocked =
            career.unlockedGameplay.includes('custom_playbook') || career.division <= 2;
        let selectedFormationId =
            career.activeFormationId || career.playbook.formations[0]?.id || '';
        let selectedPlayId =
            career.activePlayId || career.playbook.plays[0]?.id || '';

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';

        const ensureFormationShape = () => {
            const formation = career.playbook.formations.find((f) => f.id === selectedFormationId);
            if (!formation) return;
            while (formation.positions.length < 7) {
                const idx = formation.positions.length;
                formation.positions.push({
                    role: idx < 2 ? 'handler' : 'cutter',
                    x: idx < 2 ? idx * 4 : -6 + (idx - 2) * 3,
                    z: idx < 2 ? 0 : -10 - (idx - 2) * 5,
                });
            }
        };

        const render = () => {
            ensureFormationShape();
            const formation = career.playbook.formations.find((f) => f.id === selectedFormationId);
            const playsForFormation = career.playbook.plays.filter(
                (play) => play.formationId === selectedFormationId,
            );
            if (!selectedPlayId && playsForFormation.length > 0) {
                selectedPlayId = playsForFormation[0].id;
            }
            if (
                selectedPlayId &&
                !playsForFormation.some((play) => play.id === selectedPlayId)
            ) {
                selectedPlayId = playsForFormation[0]?.id || '';
            }
            const selectedPlay = playsForFormation.find((play) => play.id === selectedPlayId) || null;
            const latestReport = career.scoutingReports[0] || null;

            const formationOptions = career.playbook.formations
                .map((f) => `<option value="${f.id}" ${f.id === selectedFormationId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`)
                .join('');

            const positionRows = formation
                ? formation.positions
                      .slice(0, 7)
                      .map(
                          (pos, idx) => `
<tr>
  <td style="padding:6px 8px;">${idx + 1}</td>
  <td style="padding:6px 8px;">
    <select data-pos-role="${idx}" style="width:100%;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
      <option value="handler" ${pos.role === 'handler' ? 'selected' : ''}>Handler</option>
      <option value="cutter" ${pos.role === 'cutter' ? 'selected' : ''}>Cutter</option>
    </select>
  </td>
  <td style="padding:6px 8px;"><input data-pos-x="${idx}" type="number" step="0.5" value="${pos.x.toFixed(1)}" style="width:90px;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;"></td>
  <td style="padding:6px 8px;"><input data-pos-z="${idx}" type="number" step="0.5" value="${pos.z.toFixed(1)}" style="width:90px;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;"></td>
</tr>`,
                      )
                      .join('')
                : '<tr><td colspan="4" style="padding:8px;">No formation selected.</td></tr>';

            const playOptions = playsForFormation
                .map(
                    (play) =>
                        `<option value="${play.id}" ${play.id === selectedPlayId ? 'selected' : ''}>${escapeHtml(play.name)}</option>`,
                )
                .join('');

            const cutsRows = selectedPlay
                ? selectedPlay.cuts
                      .map(
                          (cut, idx) => `
<tr>
  <td style="padding:6px 8px;">${escapeHtml(cut.playerRole)}</td>
  <td style="padding:6px 8px;text-align:right;">${cut.timing.toFixed(1)}s</td>
  <td style="padding:6px 8px;">(${cut.startX.toFixed(1)}, ${cut.startZ.toFixed(1)}) → (${cut.endX.toFixed(1)}, ${cut.endZ.toFixed(1)})</td>
  <td style="padding:6px 8px;"><button class="menu-btn" data-cut-del="${idx}">Del</button></td>
</tr>`,
                      )
                      .join('')
                : '<tr><td colspan="4" style="padding:8px;">No play selected.</td></tr>';

            dialog.innerHTML = `
<div class="dialog wide" style="max-width:min(1020px,95vw);">
  <h2>Playbook Editor</h2>
  <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Edit formations and scripted cuts used by your AI teammates.</p>
  <p style="margin:0 0 8px;color:#9fb6d4;font-size:12px;">Scouting Link: ${
      latestReport
          ? `${escapeHtml(latestReport.teamName)} • ${escapeHtml(latestReport.gamePlan || 'No recommendation text.')}`
          : 'No scouting report available.'
  }</p>
  ${
      customPlaybookUnlocked
          ? ''
          : '<p style="margin:0 0 8px;color:#ffd166;font-size:12px;">Custom playbook tools unlock at Division 2.</p>'
  }
  <div style="margin-bottom:8px;display:flex;justify-content:flex-end;">
    <button class="menu-btn" id="playbook-apply-scout" ${
        latestReport ? '' : 'disabled'
    }>Apply Latest Scouting Plan</button>
  </div>
  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;max-height:72vh;overflow:auto;padding-right:4px;">
    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
        <h3 style="margin:0;">Formations</h3>
        <select id="formation-select" style="padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">${formationOptions}</select>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <input id="new-formation-name" placeholder="New formation name" style="flex:1;min-width:180px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
        <button class="menu-btn" id="formation-add" ${customPlaybookUnlocked ? '' : 'disabled'}>Add</button>
        <button class="menu-btn danger" id="formation-del" ${customPlaybookUnlocked ? '' : 'disabled'}>Delete</button>
      </div>
      <div style="margin-top:8px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr><th style="padding:6px 8px;text-align:left;">#</th><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:left;">X</th><th style="padding:6px 8px;text-align:left;">Z</th></tr></thead>
          <tbody>${positionRows}</tbody>
        </table>
      </div>
      <div style="margin-top:8px;">
        <button class="menu-btn primary" id="playbook-save">Save Formation Changes</button>
      </div>
    </section>

    <section style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(8,14,24,0.6);">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
        <h3 style="margin:0;">Plays</h3>
        <select id="play-select" style="padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">${playOptions || '<option value="">No plays</option>'}</select>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <input id="new-play-name" placeholder="New play name" style="flex:1;min-width:180px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;">
        <button class="menu-btn" id="play-add" ${customPlaybookUnlocked ? '' : 'disabled'}>Add</button>
        <button class="menu-btn danger" id="play-del" ${customPlaybookUnlocked ? '' : 'disabled'}>Delete</button>
        <button class="menu-btn primary" id="strategy-active">Set Active</button>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="menu-btn" id="cut-add-under" ${customPlaybookUnlocked ? '' : 'disabled'}>Add Under Cut</button>
        <button class="menu-btn" id="cut-add-deep" ${customPlaybookUnlocked ? '' : 'disabled'}>Add Deep Cut</button>
      </div>
      <div style="margin-top:8px;max-height:320px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr><th style="padding:6px 8px;text-align:left;">Role</th><th style="padding:6px 8px;text-align:right;">Timing</th><th style="padding:6px 8px;text-align:left;">Path</th><th style="padding:6px 8px;text-align:left;">Action</th></tr></thead>
          <tbody>${cutsRows}</tbody>
        </table>
      </div>
    </section>
  </div>
  <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px;">
    <button class="menu-btn" id="close">Close</button>
  </div>
</div>`;

            dialog.querySelector('#formation-select')?.addEventListener('change', (event) => {
                selectedFormationId = (event.target as HTMLSelectElement).value;
                selectedPlayId = '';
                render();
            });

            dialog.querySelector('#playbook-apply-scout')?.addEventListener('click', () => {
                const outcome = manager.applyLatestScoutingPlan();
                if (!outcome.ok) {
                    alert(outcome.reason || 'No scouting plan available.');
                    return;
                }
                const refreshed = loadCareer(career.careerSlot);
                if (!refreshed) return;
                career.playbook = refreshed.playbook;
                career.schedule = refreshed.schedule;
                career.scoutingReports = refreshed.scoutingReports;
                career.activeFormationId = refreshed.activeFormationId;
                career.activePlayId = refreshed.activePlayId;
                selectedFormationId = career.activeFormationId || selectedFormationId;
                selectedPlayId = career.activePlayId || selectedPlayId;
                render();
            });

            dialog.querySelector('#formation-add')?.addEventListener('click', () => {
                if (!customPlaybookUnlocked) {
                    alert('Custom playbook tools unlock at Division 2.');
                    return;
                }
                const input = dialog.querySelector<HTMLInputElement>('#new-formation-name');
                const name = (input?.value || '').trim() || `Custom ${career.playbook.formations.length + 1}`;
                const newFormation = editor.createFormation(name);
                const base =
                    career.playbook.formations.find((f) => f.id === selectedFormationId)
                        ?.positions
                        .slice(0, 7) || [];
                const source = base.length > 0 ? base : PlaybookEditor.createDefaultFormations()[0].positions;
                source.slice(0, 7).forEach((pos, idx) => {
                    editor.updateFormationPosition(newFormation.id, idx, pos.x, pos.z);
                    newFormation.positions[idx].role = pos.role;
                });
                selectedFormationId = newFormation.id;
                saveCareer(career);
                render();
            });

            dialog.querySelector('#formation-del')?.addEventListener('click', () => {
                if (!customPlaybookUnlocked) {
                    alert('Custom playbook tools unlock at Division 2.');
                    return;
                }
                if (career.playbook.formations.length <= 1) return;
                const removedFormationId = selectedFormationId;
                editor.deleteFormation(selectedFormationId);
                selectedFormationId = career.playbook.formations[0]?.id || '';
                selectedPlayId = '';
                if (career.activeFormationId === removedFormationId) {
                    career.activeFormationId = selectedFormationId;
                    career.activePlayId = null;
                }
                saveCareer(career);
                render();
            });

            dialog.querySelector('#playbook-save')?.addEventListener('click', () => {
                if (!formation) return;
                for (let i = 0; i < Math.min(7, formation.positions.length); i++) {
                    const role = (dialog.querySelector(`[data-pos-role="${i}"]`) as HTMLSelectElement | null)?.value;
                    const xVal = Number((dialog.querySelector(`[data-pos-x="${i}"]`) as HTMLInputElement | null)?.value);
                    const zVal = Number((dialog.querySelector(`[data-pos-z="${i}"]`) as HTMLInputElement | null)?.value);
                    formation.positions[i].role = role === 'handler' ? 'handler' : 'cutter';
                    formation.positions[i].x = Number.isFinite(xVal) ? xVal : formation.positions[i].x;
                    formation.positions[i].z = Number.isFinite(zVal) ? zVal : formation.positions[i].z;
                }
                saveCareer(career);
                render();
            });

            dialog.querySelector('#play-select')?.addEventListener('change', (event) => {
                selectedPlayId = (event.target as HTMLSelectElement).value;
                render();
            });

            dialog.querySelector('#play-add')?.addEventListener('click', () => {
                if (!customPlaybookUnlocked) {
                    alert('Custom playbook tools unlock at Division 2.');
                    return;
                }
                if (!selectedFormationId) return;
                const input = dialog.querySelector<HTMLInputElement>('#new-play-name');
                const name = (input?.value || '').trim() || `Play ${career.playbook.plays.length + 1}`;
                const play = editor.createPlay(name, selectedFormationId);
                selectedPlayId = play.id;
                saveCareer(career);
                render();
            });

            dialog.querySelector('#play-del')?.addEventListener('click', () => {
                if (!customPlaybookUnlocked) {
                    alert('Custom playbook tools unlock at Division 2.');
                    return;
                }
                if (!selectedPlayId) return;
                const removedPlayId = selectedPlayId;
                editor.deletePlay(selectedPlayId);
                selectedPlayId = '';
                if (career.activePlayId === removedPlayId) {
                    career.activePlayId = null;
                }
                saveCareer(career);
                render();
            });

            dialog.querySelector('#strategy-active')?.addEventListener('click', () => {
                if (!selectedFormationId) return;
                career.activeFormationId = selectedFormationId;
                career.activePlayId = selectedPlayId || null;
                saveCareer(career);
                render();
            });

            const addCut = (deep: boolean) => {
                if (!customPlaybookUnlocked) {
                    alert('Custom playbook tools unlock at Division 2.');
                    return;
                }
                if (!selectedPlayId) return;
                const startZ = deep ? -12 : -22;
                const endZ = deep ? -42 : -6;
                editor.addCut(selectedPlayId, 'cutter', 1.0, -5, startZ, -2, endZ, deep ? 2 : 1);
                saveCareer(career);
                render();
            };
            dialog.querySelector('#cut-add-under')?.addEventListener('click', () => addCut(false));
            dialog.querySelector('#cut-add-deep')?.addEventListener('click', () => addCut(true));

            dialog.querySelectorAll<HTMLButtonElement>('[data-cut-del]').forEach((button) => {
                button.addEventListener('click', () => {
                    if (!selectedPlayId) return;
                    const index = Number(button.dataset.cutDel ?? -1);
                    if (index < 0) return;
                    editor.removeCut(selectedPlayId, index);
                    saveCareer(career);
                    render();
                });
            });

            dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
        };

        this.container.appendChild(dialog);
        render();
    }
    
    private showScheduleScreen(): void {
        const career = loadCareer();
        if (!career) return;

        const manager = CareerManager.load(career.careerSlot);
        if (!manager) return;

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        const practiceFocuses: Array<'offense' | 'defense' | 'conditioning' | 'throws'> = [
            'offense',
            'defense',
            'conditioning',
            'throws',
        ];

        const render = () => {
            const refreshed = loadCareer(career.careerSlot);
            if (!refreshed) return;
            const latest = CareerManager.load(refreshed.careerSlot);
            if (!latest) return;
            const rows = refreshed.schedule
                .slice(0, 20)
                .map((event) => {
                    const isPast = event.date < refreshed.week;
                    const isCurrent = event.date === refreshed.week;
                    const status = isPast ? 'Past' : isCurrent ? 'Current' : `+${event.date - refreshed.week}w`;
                    const phase = event.phase.toUpperCase();
                    if (event.type === 'practice') {
                        const focusOptions = practiceFocuses
                            .map(
                                (focus) =>
                                    `<option value="${focus}" ${event.focus === focus ? 'selected' : ''}>${focus}</option>`,
                            )
                            .join('');
                        return `
<tr>
  <td style="padding:6px 8px;">${event.date}</td>
  <td style="padding:6px 8px;">${phase}</td>
  <td style="padding:6px 8px;">${status}</td>
  <td style="padding:6px 8px;">Practice</td>
  <td style="padding:6px 8px;">${escapeHtml(event.title)}</td>
  <td style="padding:6px 8px;">
    <select data-plan-practice="${event.date}" ${isPast ? 'disabled' : ''} style="width:100%;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.1);color:white;">
      ${focusOptions}
    </select>
  </td>
</tr>`;
                    }
                    if (event.type === 'scouting') {
                        const targetOptions = refreshed.standings
                            .filter((standing) => standing.teamId !== refreshed.team.id)
                            .map(
                                (standing) =>
                                    `<option value="${standing.teamId}" ${
                                        event.targetTeamId === standing.teamId ? 'selected' : ''
                                    }>${escapeHtml(standing.teamName)}</option>`,
                            )
                            .join('');
                        return `
<tr>
  <td style="padding:6px 8px;">${event.date}</td>
  <td style="padding:6px 8px;">${phase}</td>
  <td style="padding:6px 8px;">${status}</td>
  <td style="padding:6px 8px;">Scouting</td>
  <td style="padding:6px 8px;">${escapeHtml(event.title)}</td>
  <td style="padding:6px 8px;">
    <select data-plan-scout="${event.date}" ${isPast ? 'disabled' : ''} style="width:100%;padding:5px;border-radius:7px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.1);color:white;">
      ${targetOptions}
    </select>
  </td>
</tr>`;
                    }
                    const detail =
                        event.type === 'tournament'
                            ? `${event.opponent.teamName} (${event.opponent.rating} OVR)`
                            : event.type === 'tryout'
                            ? `Stage: ${event.stage}`
                            : event.type === 'bonding'
                            ? `Bonding (${event.effect})`
                            : 'Rest';
                    return `
<tr>
  <td style="padding:6px 8px;">${event.date}</td>
  <td style="padding:6px 8px;">${phase}</td>
  <td style="padding:6px 8px;">${status}</td>
  <td style="padding:6px 8px;">${escapeHtml(event.type)}</td>
  <td style="padding:6px 8px;">${escapeHtml(event.title)}</td>
  <td style="padding:6px 8px;">${escapeHtml(detail)}</td>
</tr>`;
                })
                .join('');

            const latestReport = refreshed.scoutingReports[0];
            dialog.innerHTML = `
            <div class="dialog wide" style="max-width:min(1100px,96vw);">
                <h2>Season Planner - Week ${refreshed.week}</h2>
                <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Plan upcoming practice/scouting weeks. Changes are event-driven and apply when those weeks arrive.</p>
                <p style="margin:0 0 8px;color:#9fb6d4;font-size:12px;">Latest scouting: ${
                    latestReport
                        ? `${escapeHtml(latestReport.teamName)} • ${escapeHtml(
                              latestReport.gamePlan || 'No game-plan notes.',
                          )}`
                        : 'No report yet.'
                }</p>
                <div style="max-height:64vh;overflow:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead>
                            <tr>
                                <th style="padding:6px 8px;text-align:left;">Week</th>
                                <th style="padding:6px 8px;text-align:left;">Phase</th>
                                <th style="padding:6px 8px;text-align:left;">Status</th>
                                <th style="padding:6px 8px;text-align:left;">Type</th>
                                <th style="padding:6px 8px;text-align:left;">Event</th>
                                <th style="padding:6px 8px;text-align:left;">Plan</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                    <button class="menu-btn" id="planner-auto-scout">Apply Latest Scout Plan</button>
                    <button class="menu-btn primary" id="planner-save">Save Plans</button>
                    <button class="menu-btn" id="planner-close">Close</button>
                </div>
            </div>
        `;

            dialog.querySelector('#planner-save')?.addEventListener('click', () => {
                let errors = 0;
                dialog.querySelectorAll<HTMLSelectElement>('[data-plan-practice]').forEach((select) => {
                    const week = Number(select.dataset.planPractice || 0);
                    if (week < refreshed.week) return;
                    const focus = select.value as
                        | 'offense'
                        | 'defense'
                        | 'conditioning'
                        | 'throws';
                    const outcome = latest.planPracticeFocus(week, focus);
                    if (!outcome.ok) errors++;
                });
                dialog.querySelectorAll<HTMLSelectElement>('[data-plan-scout]').forEach((select) => {
                    const week = Number(select.dataset.planScout || 0);
                    if (week < refreshed.week) return;
                    const teamId = select.value;
                    const outcome = latest.planScoutingTarget(week, teamId);
                    if (!outcome.ok) errors++;
                });
                this.render();
                render();
                if (errors > 0) {
                    alert(`${errors} plan update(s) could not be applied.`);
                } else {
                    alert('Season plans saved.');
                }
            });

            dialog.querySelector('#planner-auto-scout')?.addEventListener('click', () => {
                const outcome = latest.applyLatestScoutingPlan();
                if (!outcome.ok) {
                    alert(outcome.reason || 'No scouting plan available.');
                    return;
                }
                this.render();
                render();
                alert(
                    `Applied scouting plan for ${outcome.data?.teamName || 'opponent'}${
                        outcome.data?.focus ? ` (next practice: ${outcome.data.focus})` : ''
                    }.`,
                );
            });

            dialog.querySelector('#planner-close')?.addEventListener('click', () => dialog.remove());
        };

        this.container.appendChild(dialog);
        render();
    }
    
    private showTrainingScreen(): void {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog">
                <h2>Training Focus</h2>
                <p>Select what to focus on this week:</p>
                <div class="training-options">
                    <button class="menu-btn" id="train-offense">Offense (Throwing, Awareness)</button>
                    <button class="menu-btn" id="train-defense">Defense (Marking, Speed)</button>
                    <button class="menu-btn" id="train-conditioning">Conditioning (Stamina)</button>
                    <button class="menu-btn" id="train-throws">Throws (Accuracy, Power)</button>
                    <button class="menu-btn" id="rest">Rest Week (Recover fatigue)</button>
                </div>
                <button class="menu-btn" id="cancel">Cancel</button>
            </div>
        `;
        this.container.appendChild(dialog);
        
        const showResult = (message: string) => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'dialog-overlay';
            resultDiv.innerHTML = `
                <div class="dialog">
                    <h3>Training Complete</h3>
                    <p>${message}</p>
                    <button class="menu-btn" id="ok">OK</button>
                </div>
            `;
            this.container.appendChild(resultDiv);
            resultDiv.querySelector('#ok')?.addEventListener('click', () => {
                resultDiv.remove();
                dialog.remove();
                this.render();
            });
        };
        
        const train = (focus: 'offense' | 'defense' | 'conditioning' | 'throws') => {
            const career = CareerManager.load();
            if (career) {
                const outcome = career.conductTraining(focus);
                if (outcome.ok) {
                    showResult(`Players gained experience in ${focus}. Budget: $${career.data.finances.budget}`);
                } else {
                    showResult(outcome.reason || 'Training is unavailable right now.');
                }
            } else {
                dialog.remove();
            }
        };
        
        dialog.querySelector('#train-offense')?.addEventListener('click', () => train('offense'));
        dialog.querySelector('#train-defense')?.addEventListener('click', () => train('defense'));
        dialog.querySelector('#train-conditioning')?.addEventListener('click', () => train('conditioning'));
        dialog.querySelector('#train-throws')?.addEventListener('click', () => train('throws'));
        
        dialog.querySelector('#rest')?.addEventListener('click', () => {
            const career = CareerManager.load();
            if (career) {
                const outcome = career.takeRestWeek();
                if (outcome.ok) {
                    showResult('Players recovered fatigue.');
                } else {
                    showResult(outcome.reason || 'Rest week is unavailable right now.');
                }
            } else {
                dialog.remove();
            }
        });
        
        dialog.querySelector('#cancel')?.addEventListener('click', () => {
            dialog.remove();
        });
    }

    private showTryoutScreen(careerInput?: CareerData): void {
        const career = careerInput || loadCareer();
        if (!career) return;
        const manager = CareerManager.load(career.careerSlot);
        if (!manager) return;

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';

        const render = () => {
            const refreshed = loadCareer(career.careerSlot);
            if (!refreshed) return;
            const latest = CareerManager.load(refreshed.careerSlot);
            if (!latest) return;
            const tryout = latest.data.activeTryout;
            const event = latest.getCurrentEvent();
            const candidates =
                tryout?.candidates
                    .slice(0, 12)
                    .map((candidate) => {
                        const statsPreview = [
                            typeof candidate.knownStats.speed === 'number'
                                ? `SPD ${Math.round(candidate.knownStats.speed)}`
                                : null,
                            typeof candidate.knownStats.throwAccuracy === 'number'
                                ? `THR ${Math.round(candidate.knownStats.throwAccuracy)}`
                                : null,
                            typeof candidate.knownStats.catching === 'number'
                                ? `CAT ${Math.round(candidate.knownStats.catching)}`
                                : null,
                            `POT ${candidate.potential}`,
                        ]
                            .filter(Boolean)
                            .join(' • ');
                        return `
                        <tr>
                          <td style="padding:6px 8px;">${escapeHtml(candidate.name)}</td>
                          <td style="padding:6px 8px;text-align:right;">${candidate.age}</td>
                          <td style="padding:6px 8px;text-align:right;">${candidate.teamPreference}</td>
                          <td style="padding:6px 8px;">${escapeHtml(statsPreview)}</td>
                          <td style="padding:6px 8px;">
                            <button class="menu-btn small" data-offer-candidate="${candidate.id}">Offer</button>
                          </td>
                        </tr>`;
                    })
                    .join('') || '<tr><td colspan="5" style="padding:8px;">No active candidates.</td></tr>';

            dialog.innerHTML = `
            <div class="dialog wide" style="max-width:min(980px,95vw);">
              <h2>Tryout Center</h2>
              <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Current week: ${refreshed.week} • Event: ${escapeHtml(event?.title || 'None')}</p>
              <p style="margin:4px 0 10px;color:#9fb6d4;font-size:12px;">Announcement posted: ${tryout?.announcementPosted ? 'Yes' : 'No'} • Drills: ${(tryout?.drillsRun || []).join(', ') || 'None'}</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                <button class="menu-btn" id="tryout-announce">Post Announcement</button>
                <button class="menu-btn" id="tryout-sprint">Sprint Drill</button>
                <button class="menu-btn" id="tryout-throwing">Throwing Drill</button>
                <button class="menu-btn" id="tryout-cutting">Cutting Drill</button>
                <button class="menu-btn" id="tryout-scrimmage">Scrimmage Drill</button>
                <button class="menu-btn" id="tryout-finish">Finish Cycle</button>
              </div>
              <div style="max-height:55vh;overflow:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                  <thead><tr><th style="padding:6px 8px;text-align:left;">Candidate</th><th style="padding:6px 8px;text-align:right;">Age</th><th style="padding:6px 8px;text-align:right;">Pref</th><th style="padding:6px 8px;text-align:left;">Known Stats</th><th style="padding:6px 8px;text-align:left;">Action</th></tr></thead>
                  <tbody>${candidates}</tbody>
                </table>
              </div>
              <div style="margin-top:12px;display:flex;justify-content:flex-end;">
                <button class="menu-btn" id="tryout-close">Close</button>
              </div>
            </div>`;

            const run = (action: () => { ok: boolean; reason?: string }) => {
                const outcome = action();
                if (!outcome.ok) {
                    alert(outcome.reason || 'Action unavailable.');
                }
                render();
                this.render();
            };

            dialog.querySelector('#tryout-announce')?.addEventListener('click', () =>
                run(() => latest.postTryoutAnnouncement()),
            );
            dialog.querySelector('#tryout-sprint')?.addEventListener('click', () =>
                run(() => latest.runTryoutDrill('sprint')),
            );
            dialog.querySelector('#tryout-throwing')?.addEventListener('click', () =>
                run(() => latest.runTryoutDrill('throwing')),
            );
            dialog.querySelector('#tryout-cutting')?.addEventListener('click', () =>
                run(() => latest.runTryoutDrill('cutting')),
            );
            dialog.querySelector('#tryout-scrimmage')?.addEventListener('click', () =>
                run(() => latest.runTryoutDrill('scrimmage')),
            );
            dialog.querySelector('#tryout-finish')?.addEventListener('click', () =>
                run(() => latest.finishTryoutCycle()),
            );
            dialog.querySelectorAll<HTMLButtonElement>('[data-offer-candidate]').forEach((button) => {
                button.addEventListener('click', () => {
                    const candidateId = button.dataset.offerCandidate;
                    if (!candidateId) return;
                    const outcome = latest.offerTryoutSpot(candidateId);
                    if (!outcome.ok) {
                        alert(outcome.reason || 'Offer failed.');
                    } else if (outcome.data) {
                        alert(
                            outcome.data.accepted
                                ? `${outcome.data.name} accepted the offer.`
                                : `${outcome.data.name} declined the offer.`,
                        );
                    }
                    render();
                    this.render();
                });
            });
            dialog.querySelector('#tryout-close')?.addEventListener('click', () => dialog.remove());
        };

        this.container.appendChild(dialog);
        render();
    }

    private showScoutingScreen(careerInput?: CareerData): void {
        const career = careerInput || loadCareer();
        if (!career) return;
        const manager = CareerManager.load(career.careerSlot);
        if (!manager) return;

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';

        const render = () => {
            const refreshed = loadCareer(career.careerSlot);
            if (!refreshed) return;
            const reports = refreshed.scoutingReports.slice(0, 8);
            const reportsHtml =
                reports.length > 0
                    ? reports
                          .map(
                              (report) => `
                <div style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(8,14,24,0.55);">
                  <p style="margin:0;font-weight:600;">${escapeHtml(report.teamName)} (S${report.season} W${report.week})</p>
                  <p style="margin:6px 0 0;font-size:12px;color:#c8d7ee;">Strengths: ${escapeHtml(report.strengths.join('; ') || 'Unknown')}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#c8d7ee;">Weaknesses: ${escapeHtml(report.weaknesses.join('; ') || 'Unknown')}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#9fb6d4;">Tendencies: ${escapeHtml(report.tendencies.join('; '))}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#9fb6d4;">Recommendation: ${escapeHtml(
                      report.gamePlan || 'No tactical recommendation.',
                  )}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#8fb4d8;">Formation: ${escapeHtml(
                      report.recommendedFormationId || 'N/A',
                  )} • Defense: ${escapeHtml(report.recommendedDefense || 'N/A')} • Practice: ${escapeHtml(
                      report.recommendedPracticeFocus || 'N/A',
                  )} • Confidence ${Math.round(report.confidence * 100)}%</p>
                </div>`,
                          )
                          .join('')
                    : '<p style="color:#9fb6d4;">No scouting reports yet.</p>';

            dialog.innerHTML = `
            <div class="dialog wide" style="max-width:min(900px,95vw);">
              <h2>Scouting Desk</h2>
              <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Spend $1,200 to generate a scouting report during scouting weeks, then apply recommendations to your playbook and practice plan.</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                <button class="menu-btn primary" id="scout-generate">Generate Report</button>
                <button class="menu-btn" id="scout-apply">Apply Latest Plan</button>
                <button class="menu-btn" id="scout-close">Close</button>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto;">
                ${reportsHtml}
              </div>
            </div>`;

            dialog.querySelector('#scout-generate')?.addEventListener('click', () => {
                const latest = CareerManager.load(refreshed.careerSlot);
                if (!latest) return;
                const outcome = latest.scoutOpponent();
                if (!outcome.ok) {
                    alert(outcome.reason || 'Scouting unavailable.');
                } else if (outcome.data) {
                    alert(
                        `Report complete for ${outcome.data.teamName}\nStrengths: ${outcome.data.strengths.join(', ')}\nWeaknesses: ${outcome.data.weaknesses.join(', ')}`,
                    );
                }
                this.render();
                render();
            });
            dialog.querySelector('#scout-apply')?.addEventListener('click', () => {
                const latest = CareerManager.load(refreshed.careerSlot);
                if (!latest) return;
                const outcome = latest.applyLatestScoutingPlan();
                if (!outcome.ok) {
                    alert(outcome.reason || 'No scouting plan available.');
                } else {
                    alert(
                        `Applied plan for ${outcome.data?.teamName || 'opponent'}.\nFormation: ${
                            outcome.data?.formationId || 'n/a'
                        }${outcome.data?.focus ? `\nNext practice: ${outcome.data.focus}` : ''}`,
                    );
                }
                this.render();
                render();
            });
            dialog.querySelector('#scout-close')?.addEventListener('click', () => dialog.remove());
        };

        this.container.appendChild(dialog);
        render();
    }

    private showSpiritDashboard(careerInput?: CareerData): void {
        const career = careerInput || loadCareer();
        if (!career) return;

        const incidents = career.spiritIncidents
            .slice(0, 10)
            .map(
                (incident) =>
                    `<li>${incident.severity === 'positive' ? '+' : ''}${incident.delta.toFixed(
                        2,
                    )} • S${incident.season}W${incident.week} • ${escapeHtml(incident.description)}</li>`,
            )
            .join('');
        const captains = career.team.roster
            .filter((player) => career.captainIds.includes(player.id))
            .map((player) => `${player.fullName} (${player.attributes.spirit.toFixed(0)} spirit)`)
            .join(', ');
        const cultureLines = [
            `Competitive: ${career.culture.competitive.toFixed(1)}`,
            `Spirited: ${career.culture.spirited.toFixed(1)}`,
            `Athletic: ${career.culture.athletic.toFixed(1)}`,
            `Cerebral: ${career.culture.cerebral.toFixed(1)}`,
            `Clutch: ${career.culture.clutch.toFixed(1)}`,
        ].join(' • ');

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog wide">
                <h2>Spirit Dashboard</h2>
                <p>Team Spirit: ${career.team.stats.spiritScore.toFixed(2)} / 10</p>
                <p>Captains: ${escapeHtml(captains || 'None')}</p>
                <p>Culture: ${escapeHtml(cultureLines)}</p>
                <p style="margin-top:10px;font-weight:600;">Recent Incidents</p>
                <ul style="max-height:220px;overflow:auto;">${incidents || '<li>No incidents logged.</li>'}</ul>
                <button class="menu-btn" id="close">Close</button>
            </div>
        `;
        this.container.appendChild(dialog);
        dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
    }

    private showMilestonesScreen(careerInput?: CareerData): void {
        const career = careerInput || loadCareer();
        if (!career) return;

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        const rows = career.milestones
            .map((milestone) => {
                const pct = Math.min(100, (milestone.progress / Math.max(1, milestone.target)) * 100);
                return `
                <div style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.16);background:rgba(8,14,24,0.55);">
                  <p style="margin:0;font-weight:600;">${escapeHtml(milestone.title)} ${milestone.completed ? '✓' : ''}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#c8d7ee;">${escapeHtml(milestone.description)}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#9fb6d4;">Reward: ${escapeHtml(milestone.reward)}</p>
                  <div style="height:7px;background:rgba(255,255,255,0.1);border-radius:6px;margin-top:8px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#39d67d,#00bcd4);"></div>
                  </div>
                  <p style="margin:4px 0 0;font-size:11px;color:#9fb6d4;">${milestone.progress.toFixed(0)} / ${milestone.target}</p>
                </div>`;
            })
            .join('');

        dialog.innerHTML = `
            <div class="dialog wide" style="max-width:min(920px,95vw);">
                <h2>Career Milestones</h2>
                <p style="margin-top:-4px;color:#c8d7ee;font-size:13px;">Nationals Titles: ${career.nationalsTitles} • Prestige Level: ${career.prestigeLevel}</p>
                <div style="display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto;">${rows}</div>
                <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
                    <button class="menu-btn" id="prestige-start" ${career.nationalsTitles > 0 ? '' : 'disabled'}>Start Prestige Run</button>
                    <button class="menu-btn" id="close">Close</button>
                </div>
            </div>
        `;
        this.container.appendChild(dialog);

        dialog.querySelector('#prestige-start')?.addEventListener('click', () => {
            if (!career.nationalsTitles) return;
            if (!confirm('Start a prestige career in this slot? This replaces current career progression.')) return;
            const prestigeCareer = createNewCareer(career.playerName, career.teamName, {
                mode: career.mode,
                difficulty: 'hard',
                homeRegion: career.homeRegion,
                primaryColor: career.team.primaryColor,
                secondaryColor: career.team.secondaryColor,
                slot: career.careerSlot,
                prestigeLevel: career.prestigeLevel + 1,
            });
            saveCareer(prestigeCareer, career.careerSlot);
            dialog.remove();
            this.render();
        });
        dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
    }

    private showProfileScreen(careerInput?: CareerData): void {
        const career = careerInput || loadCareer();
        if (!career) return;
        const stats = saveManager.getStats();
        const completionPct =
            stats.careerAttempts > 0
                ? (stats.careerCompletions / stats.careerAttempts) * 100
                : 0;
        const winRate =
            stats.totalGamesPlayed > 0
                ? (stats.totalWins / stats.totalGamesPlayed) * 100
                : 0;
        const avgSpirit =
            stats.totalGamesPlayed > 0
                ? stats.totalSpiritScore / stats.totalGamesPlayed
                : 0;

        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog wide">
                <h2>Player Profile</h2>
                <p>Games Played: ${stats.totalGamesPlayed}</p>
                <p>Goals: ${stats.careerGoals} • Assists: ${stats.careerAssists} • Blocks: ${stats.careerBlocks}</p>
                <p>Turnovers: ${stats.careerTurnovers} • Completion: ${completionPct.toFixed(1)}%</p>
                <p>Layout Catches: ${stats.layoutCatches} • Sky Wins: ${stats.skyWins}</p>
                <p>Total Throw Distance: ${stats.totalThrowDistanceMeters.toFixed(1)} m</p>
                <p>Win Rate: ${winRate.toFixed(1)}% • Avg Spirit: ${avgSpirit.toFixed(2)}</p>
                <p>Achievements Unlocked: ${saveManager.load()?.achievements.length || 0}</p>
                <button class="menu-btn" id="close">Close</button>
            </div>
        `;
        this.container.appendChild(dialog);
        dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
    }

    private showSimulationSummaryDialog(summary: CareerSimSummary): void {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        const points = summary.points
            .slice(0, 20)
            .map(
                (point) =>
                    `<li>P${point.point}: ${point.scoringSide === 'player' ? 'Your team' : 'Opponent'} (${point.playerScore}-${point.opponentScore})</li>`,
            )
            .join('');
        dialog.innerHTML = `
            <div class="dialog wide" style="max-width:min(860px,95vw);">
                <h2>Simulation Complete</h2>
                <p>${escapeHtml(summary.eventTitle)} • Final: ${summary.playerScore}-${summary.opponentScore}</p>
                <p>Spirit: You ${summary.spiritReport.player.toFixed(1)} / Opp ${summary.spiritReport.opponent.toFixed(1)}</p>
                <p style="font-weight:600;margin-top:8px;">Key Plays</p>
                <ul style="max-height:130px;overflow:auto;">${summary.highlights.map((line) => `<li>${escapeHtml(line)}</li>`).join('') || '<li>No highlights recorded.</li>'}</ul>
                <p style="font-weight:600;margin-top:8px;">Point Progression</p>
                <ul style="max-height:140px;overflow:auto;">${points}</ul>
                <button class="menu-btn" id="close">Close</button>
            </div>
        `;
        this.container.appendChild(dialog);
        dialog.querySelector('#close')?.addEventListener('click', () => dialog.remove());
    }
    
    // Pause menu overlay
    showPauseMenu(onResume: () => void, onQuit: () => void): void {
        this.pauseMenuCallbacks = { onResume, onQuit };
        this.setState('paused');
    }

    private renderPausedUI(): void {
        const onResume = this.pauseMenuCallbacks?.onResume || (() => {});
        const onQuit = this.pauseMenuCallbacks?.onQuit || (() => {});

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
        this.container.appendChild(pause);
        
        pause.querySelector('#resume')?.addEventListener('click', () => {
            this.setState('none');
            onResume();
        });
        
        pause.querySelector('#settings')?.addEventListener('click', () => {
            this.setState('settings');
        });
        
        pause.querySelector('#quit')?.addEventListener('click', () => {
            if (confirm('Quit current match? Progress will not be saved.')) {
                this.pauseMenuCallbacks = null;
                onQuit();
            }
        });
    }
    
    private renderPracticeMenu(): void {
        const menu = document.createElement('div');
        menu.className = 'practice-menu';

        const drills = practiceManager.getAllDrillConfigs();

        let drillsHtml = '';
        drills.forEach(({ type, config }) => {
            const bestScore = practiceManager.getBestScore(type);
            const bestScoreText = bestScore > 0 ? `Best: ${bestScore.toFixed(1)}` : 'Not attempted';

            drillsHtml += `
                <div class="drill-card" data-drill="${type}">
                    <h3>${config.name}</h3>
                    <p>${config.description}</p>
                    <div class="drill-meta">
                        <span>${config.duration > 0 ? `${config.duration}s` : 'Untimed'}</span>
                        <span>Target: ${config.targetScore}</span>
                    </div>
                    <div class="drill-best">${bestScoreText}</div>
                    <button class="menu-btn" data-drill-start="${type}">Start Drill</button>
                </div>
            `;
        });

        menu.innerHTML = `
            <h1>Practice Mode</h1>
            <p class="menu-subtitle">Master your skills with focused drills.</p>
            <div class="drill-grid">
                ${drillsHtml}
            </div>
            <div class="menu-buttons">
                <button class="menu-btn" id="back">Back to Main</button>
            </div>
        `;
        this.container.appendChild(menu);

        // Add event listeners for drill start buttons
        drills.forEach(({ type }) => {
            menu.querySelector(`[data-drill-start="${type}"]`)?.addEventListener('click', () => {
                if (this.navigate) {
                    this.navigate('/drill', { type });
                    return;
                }
                this.setState('none');
                window.dispatchEvent(new CustomEvent('startPracticeDrill', {
                    detail: { drillType: type }
                }));
            });
        });

        menu.querySelector('#back')?.addEventListener('click', () => {
            this.nav('/title') || this.setState('title');
        });
    }

    private renderLockerMenu(): void {
        const progression = saveManager.getProgression();
        const unlockedIds = progression.unlockedCosmetics;
        const equipped = progression.equippedCosmetics;

        const categories = [
            { type: 'trail', label: 'Disc Trails' },
            { type: 'cosmetic', label: 'Jersey Accents' },
            { type: 'celebration', label: 'Celebrations' },
        ];

        let categoriesHtml = '';
        categories.forEach(cat => {
            const items = UNLOCKABLES.filter(u => u.type === cat.type);
            let itemsHtml = '';
            
            // Add "None" or "Default" option
            const isEquippedDefault = !equipped[cat.type];
            itemsHtml += `
                <div class="cosmetic-card ${isEquippedDefault ? 'active' : ''}" data-id="default" data-type="${cat.type}">
                    <div class="cosmetic-name">Default</div>
                    <div class="cosmetic-desc">The original look.</div>
                    <button class="menu-btn small equip-btn" data-id="default" data-type="${cat.type}">${isEquippedDefault ? 'Equipped' : 'Equip'}</button>
                </div>
            `;

            items.forEach(item => {
                const isUnlocked = unlockedIds.includes(item.id);
                const isEquipped = equipped[cat.type] === item.id;
                
                itemsHtml += `
                    <div class="cosmetic-card ${isEquipped ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}">
                        <div class="cosmetic-name">${escapeHtml(item.name)}</div>
                        <div class="cosmetic-desc">${escapeHtml(item.description)}</div>
                        ${isUnlocked 
                            ? `<button class="menu-btn small equip-btn" data-id="${item.id}" data-type="${cat.type}">${isEquipped ? 'Equipped' : 'Equip'}</button>`
                            : `<div class="cosmetic-lock">Unlock at Lvl ${item.levelRequired}</div>`
                        }
                    </div>
                `;
            });

            categoriesHtml += `
                <div class="locker-category">
                    <h2>${cat.label}</h2>
                    <div class="cosmetic-grid">${itemsHtml}</div>
                </div>
            `;
        });

        const menu = document.createElement('div');
        menu.className = 'locker-menu';
        menu.innerHTML = `
            <h1>Locker Room</h1>
            <p class="menu-subtitle">Customize your player and gear with unlocked items.</p>
            
            <div class="locker-content">
                ${categoriesHtml}
            </div>

            <div class="menu-buttons">
                <button class="menu-btn" id="back">Back to Main</button>
            </div>
        `;
        this.container.appendChild(menu);

        menu.querySelectorAll('.equip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = (btn as HTMLElement).dataset.id;
                const type = (btn as HTMLElement).dataset.type;
                if (!id || !type) return;

                if (id === 'default') {
                    delete equipped[type];
                } else {
                    equipped[type] = id;
                }
                
                saveManager.saveProgression(progression);
                this.render();
            });
        });

        menu.querySelector('#back')?.addEventListener('click', () => {
            this.nav('/title') || this.setState('title');
        });
    }

    hide(): void {
        this.container.style.display = 'none';
    }

    show(): void {
        this.container.style.display = 'flex';
    }
}

function cloneSettings(settings: GameSettings): GameSettings {
    return JSON.parse(JSON.stringify(settings)) as GameSettings;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
