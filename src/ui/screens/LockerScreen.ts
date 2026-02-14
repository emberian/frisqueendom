import { saveManager } from '../../data/SaveLoad';
import { UNLOCKABLES } from '../../data/Progression';
import { escapeHtml, type Screen, type ScreenContext } from './ScreenInterface';

export class LockerScreen implements Screen {
    private ctx: ScreenContext;
    private root: HTMLDivElement | null = null;

    constructor(ctx: ScreenContext) {
        this.ctx = ctx;
    }

    render(container: HTMLElement): void {
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
        container.appendChild(menu);
        this.root = menu;

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
                this.ctx.rerender();
            });
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
