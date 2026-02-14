import type { Screen, ScreenContext, MultiplayerMode, QuickMatchConfig, MatchSetupConfig } from './ScreenInterface';

/** Module-level match setup config, shared across renders */
let _matchSetupConfig: MatchSetupConfig = {
    scoreTarget: 15,
    winByTwo: true,
    pointCap: 0,
    timeOfDay: 'midday',
    venue: 'park',
    wind: 'calm',
};

export function getMatchSetupConfig(): MatchSetupConfig {
    return { ..._matchSetupConfig };
}

export function setMatchSetupConfig(config: Partial<MatchSetupConfig>): void {
    if (config.scoreTarget != null) _matchSetupConfig.scoreTarget = config.scoreTarget;
    if (config.winByTwo != null) _matchSetupConfig.winByTwo = config.winByTwo;
    if (config.pointCap != null) _matchSetupConfig.pointCap = config.pointCap;
    if (config.timeOfDay != null) _matchSetupConfig.timeOfDay = config.timeOfDay;
    if (config.venue != null) _matchSetupConfig.venue = config.venue;
    if (config.wind != null) _matchSetupConfig.wind = config.wind;
}

export class MatchSetupScreen implements Screen {
    private ctx: ScreenContext;
    private root: HTMLDivElement | null = null;

    constructor(ctx: ScreenContext) {
        this.ctx = ctx;
    }

    /** Pre-fill match setup form from URL query params. */
    setDefaults(config: Partial<QuickMatchConfig>): void {
        if (!this.root) return;
        const set = (id: string, val?: string | number) => {
            if (val == null) return;
            const el = this.root!.querySelector('#' + id) as HTMLSelectElement | null;
            if (el) el.value = String(val);
        };
        set('team-color', config.color);
        set('difficulty', config.difficulty);
        set('weather', config.weather);
        if (config.multiplayerMode) set('multiplayer-mode', config.multiplayerMode);

        if (config.gameTo != null) {
            _matchSetupConfig.scoreTarget = config.gameTo;
        }
        if (config.timeOfDay != null) {
            _matchSetupConfig.timeOfDay = config.timeOfDay;
        }

        const activateGroupBtn = (groupId: string, value: string) => {
            const group = this.root!.querySelector('#' + groupId);
            if (!group) return;
            group.querySelectorAll('.setup-opt-btn').forEach((btn) => {
                btn.classList.toggle('active', (btn as HTMLElement).dataset.val === value);
            });
        };

        activateGroupBtn('score-target-group', String(_matchSetupConfig.scoreTarget));
        activateGroupBtn('time-of-day-group', _matchSetupConfig.timeOfDay);
    }

    render(container: HTMLElement): void {
        const menu = document.createElement('div');
        menu.className = 'match-setup';
        const defaultLanUrl =
            window.location.hostname === 'localhost'
                ? 'ws://localhost:8787/ws'
                : `wss://${window.location.host}/ws`;
        const cfg = _matchSetupConfig;
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

                <label>Score to:</label>
                <div class="setup-btn-group" id="score-target-group">
                    <button class="setup-opt-btn${cfg.scoreTarget === 11 ? ' active' : ''}" data-val="11">11</button>
                    <button class="setup-opt-btn${cfg.scoreTarget === 13 ? ' active' : ''}" data-val="13">13</button>
                    <button class="setup-opt-btn${cfg.scoreTarget === 15 ? ' active' : ''}" data-val="15">15</button>
                    <button class="setup-opt-btn${cfg.scoreTarget !== 11 && cfg.scoreTarget !== 13 && cfg.scoreTarget !== 15 ? ' active' : ''}" data-val="custom" id="score-custom-btn">Custom</button>
                </div>
                <input type="number" id="score-custom-input" min="1" max="99" value="${cfg.scoreTarget}"
                    style="display:${cfg.scoreTarget !== 11 && cfg.scoreTarget !== 13 && cfg.scoreTarget !== 15 ? 'block' : 'none'};width:80px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;font-family:monospace;">

                <label>Win by 2:</label>
                <div class="setup-btn-group" id="win-by-two-group">
                    <button class="setup-opt-btn${cfg.winByTwo ? ' active' : ''}" data-val="yes">Yes</button>
                    <button class="setup-opt-btn${!cfg.winByTwo ? ' active' : ''}" data-val="no">No</button>
                </div>

                <label>Point Cap:</label>
                <div class="setup-btn-group" id="point-cap-group">
                    <button class="setup-opt-btn${cfg.pointCap === 0 ? ' active' : ''}" data-val="0">None</button>
                    <button class="setup-opt-btn${cfg.pointCap === 17 ? ' active' : ''}" data-val="17">17</button>
                    <button class="setup-opt-btn${cfg.pointCap === 19 ? ' active' : ''}" data-val="19">19</button>
                    <button class="setup-opt-btn${cfg.pointCap !== 0 && cfg.pointCap !== 17 && cfg.pointCap !== 19 ? ' active' : ''}" data-val="custom" id="cap-custom-btn">Custom</button>
                </div>
                <input type="number" id="cap-custom-input" min="1" max="99" value="${cfg.pointCap || ''}"
                    style="display:${cfg.pointCap !== 0 && cfg.pointCap !== 17 && cfg.pointCap !== 19 ? 'block' : 'none'};width:80px;padding:6px;border-radius:7px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.1);color:white;font-family:monospace;">

                <label>Time of Day:</label>
                <div class="setup-btn-group" id="time-of-day-group">
                    <button class="setup-opt-btn${cfg.timeOfDay === 'morning' ? ' active' : ''}" data-val="morning">Morning</button>
                    <button class="setup-opt-btn${cfg.timeOfDay === 'midday' ? ' active' : ''}" data-val="midday">Midday</button>
                    <button class="setup-opt-btn${cfg.timeOfDay === 'golden_hour' ? ' active' : ''}" data-val="golden_hour">Golden Hour</button>
                    <button class="setup-opt-btn${cfg.timeOfDay === 'sunset' ? ' active' : ''}" data-val="sunset">Sunset</button>
                    <button class="setup-opt-btn${cfg.timeOfDay === 'night' ? ' active' : ''}" data-val="night">Night</button>
                </div>

                <label>Venue:</label>
                <div class="setup-btn-group" id="venue-group">
                    <button class="setup-opt-btn${cfg.venue === 'park' ? ' active' : ''}" data-val="park">Park</button>
                    <button class="setup-opt-btn${cfg.venue === 'tournament' ? ' active' : ''}" data-val="tournament">Tournament</button>
                    <button class="setup-opt-btn${cfg.venue === 'stadium' ? ' active' : ''}" data-val="stadium">Stadium</button>
                </div>

                <label>Wind:</label>
                <div class="setup-btn-group" id="wind-group">
                    <button class="setup-opt-btn${cfg.wind === 'calm' ? ' active' : ''}" data-val="calm">Calm</button>
                    <button class="setup-opt-btn${cfg.wind === 'breezy' ? ' active' : ''}" data-val="breezy">Breezy</button>
                    <button class="setup-opt-btn${cfg.wind === 'windy' ? ' active' : ''}" data-val="windy">Windy</button>
                    <button class="setup-opt-btn${cfg.wind === 'gusty' ? ' active' : ''}" data-val="gusty">Gusty</button>
                    <button class="setup-opt-btn${cfg.wind === 'random' ? ' active' : ''}" data-val="random">Random</button>
                </div>

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

            <style>
                .setup-btn-group {
                    display:flex; gap:6px; flex-wrap:wrap; margin-bottom:4px;
                }
                .setup-opt-btn {
                    padding:6px 12px; border-radius:8px;
                    border:1px solid rgba(255,255,255,0.26);
                    background:rgba(7,20,35,0.85);
                    color:rgba(255,255,255,0.88); font-family:monospace; font-size:12px;
                    letter-spacing:0.06em; cursor:pointer;
                    transition:background 0.15s, border-color 0.15s;
                }
                .setup-opt-btn:hover {
                    background:rgba(20,50,80,0.9);
                    border-color:rgba(255,255,255,0.45);
                }
                .setup-opt-btn.active {
                    background:linear-gradient(150deg,rgba(255,209,102,0.22),rgba(255,122,34,0.24));
                    border-color:rgba(255,209,102,0.72);
                    color:white; font-weight:bold;
                }
            </style>
        `;
        container.appendChild(menu);
        this.root = menu;

        // --- Wire up button-group config selectors ---
        const wireButtonGroup = (
            groupId: string,
            onSelect: (val: string) => void,
        ) => {
            const group = menu.querySelector(`#${groupId}`);
            if (!group) return;
            group.querySelectorAll<HTMLButtonElement>('.setup-opt-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    group.querySelectorAll('.setup-opt-btn').forEach((b) => b.classList.remove('active'));
                    btn.classList.add('active');
                    onSelect(btn.dataset.val || '');
                });
            });
        };

        const scoreCustomInput = menu.querySelector('#score-custom-input') as HTMLInputElement;
        wireButtonGroup('score-target-group', (val) => {
            if (val === 'custom') {
                scoreCustomInput.style.display = 'block';
                scoreCustomInput.focus();
            } else {
                scoreCustomInput.style.display = 'none';
                cfg.scoreTarget = parseInt(val, 10);
            }
        });
        scoreCustomInput?.addEventListener('input', () => {
            const v = parseInt(scoreCustomInput.value, 10);
            if (v > 0 && v < 100) cfg.scoreTarget = v;
        });

        wireButtonGroup('win-by-two-group', (val) => {
            cfg.winByTwo = val === 'yes';
        });

        const capCustomInput = menu.querySelector('#cap-custom-input') as HTMLInputElement;
        wireButtonGroup('point-cap-group', (val) => {
            if (val === 'custom') {
                capCustomInput.style.display = 'block';
                capCustomInput.focus();
            } else {
                capCustomInput.style.display = 'none';
                cfg.pointCap = parseInt(val, 10);
            }
        });
        capCustomInput?.addEventListener('input', () => {
            const v = parseInt(capCustomInput.value, 10);
            if (v > 0 && v < 100) cfg.pointCap = v;
        });

        wireButtonGroup('time-of-day-group', (val) => {
            cfg.timeOfDay = val;
        });

        wireButtonGroup('venue-group', (val) => {
            cfg.venue = val;
        });

        wireButtonGroup('wind-group', (val) => {
            cfg.wind = val;
        });

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
            const gameTo = cfg.scoreTarget;
            const timeOfDay = cfg.timeOfDay;
            const weather = (menu.querySelector('#weather') as HTMLSelectElement).value;
            const multiplayerMode = (menu.querySelector(
                '#multiplayer-mode',
            ) as HTMLSelectElement).value as MultiplayerMode;
            const lanServerUrl = lanUrlInput.value.trim();
            const lanRoom = lanRoomInput.value
                .trim()
                .slice(0, 64);

            // Persist the full config for external consumers
            _matchSetupConfig = { ...cfg };

            const p: Record<string, string> = { color, difficulty, gameTo: String(gameTo) };
            if (multiplayerMode !== 'single') p.multiplayer = multiplayerMode;
            if (timeOfDay) p.time = timeOfDay;
            if (weather) p.weather = weather;
            if (multiplayerMode === 'lan_remote') {
                if (lanServerUrl) p.relay = lanServerUrl;
                p.room = lanRoom || 'fqd-room-1';
            }
            this.ctx.navigate('/play', p);
        });

        menu.querySelector('#watch-sim')?.addEventListener('click', () => {
            const color = (menu.querySelector('#team-color') as HTMLSelectElement).value;
            const difficulty = (menu.querySelector('#difficulty') as HTMLSelectElement).value;
            const gameTo = cfg.scoreTarget;
            const timeOfDay = cfg.timeOfDay;
            const weather = (menu.querySelector('#weather') as HTMLSelectElement).value;

            // Persist the full config for external consumers
            _matchSetupConfig = { ...cfg };

            const p: Record<string, string> = { color, difficulty, gameTo: String(gameTo) };
            if (timeOfDay) p.time = timeOfDay;
            if (weather) p.weather = weather;
            this.ctx.navigate('/watch', p);
        });

        menu.querySelector('#back')?.addEventListener('click', () => {
            this.ctx.navigate('/title');
        });
    }

    destroy(): void {
        this.root?.remove();
        this.root = null;
    }
}
