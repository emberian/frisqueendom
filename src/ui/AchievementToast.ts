// Achievement Toast — slide-in notification for newly earned achievements

const RARITY_COLORS: Record<string, string> = {
    common: '#b0b0b0',
    rare: '#4a86c8',
    epic: '#a855f7',
    legendary: '#f59e0b',
};

const RARITY_GLOW: Record<string, string> = {
    common: '0 0 12px rgba(176,176,176,0.3)',
    rare: '0 0 16px rgba(74,134,200,0.4)',
    epic: '0 0 20px rgba(168,85,247,0.5)',
    legendary: '0 0 24px rgba(245,158,11,0.6)',
};

interface ToastItem {
    name: string;
    description: string;
    rarity: string;
    xp: number;
}

let instance: AchievementToast | null = null;

export class AchievementToast {
    private queue: ToastItem[] = [];
    private showing = false;
    private container: HTMLDivElement;

    /** Optional callback — wire up audio here. */
    onToastShow?: () => void;

    private constructor() {
        this.container = document.createElement('div');
        this.container.style.cssText =
            'position:fixed;top:16px;right:16px;z-index:900;' +
            'pointer-events:none;display:flex;flex-direction:column;gap:8px;' +
            'font-family:Arial,Helvetica,sans-serif;';
        document.body.appendChild(this.container);
    }

    static getInstance(): AchievementToast {
        if (!instance) instance = new AchievementToast();
        return instance;
    }

    show(item: ToastItem): void {
        this.queue.push(item);
        if (!this.showing) this.processQueue();
    }

    private processQueue(): void {
        if (this.queue.length === 0) {
            this.showing = false;
            return;
        }
        this.showing = true;
        const item = this.queue.shift()!;
        this.displayToast(item);
    }

    private displayToast(item: ToastItem): void {
        const color = RARITY_COLORS[item.rarity] ?? RARITY_COLORS.common;
        const glow = RARITY_GLOW[item.rarity] ?? RARITY_GLOW.common;

        const toast = document.createElement('div');
        toast.style.cssText =
            'display:flex;align-items:center;gap:12px;' +
            'padding:12px 16px;border-radius:10px;min-width:280px;max-width:360px;' +
            `background:rgba(10,16,28,0.92);border:1px solid rgba(255,255,255,0.12);` +
            `border-left:3px solid ${color};` +
            `box-shadow:${glow},0 4px 16px rgba(0,0,0,0.4);` +
            'backdrop-filter:blur(8px);' +
            'transform:translateX(120%);opacity:0;' +
            'transition:transform 0.4s cubic-bezier(0.16,1,0.3,1),opacity 0.4s ease;';

        // Rarity badge circle
        const badge = document.createElement('div');
        badge.style.cssText =
            `width:36px;height:36px;border-radius:50%;flex-shrink:0;` +
            `background:${color}22;border:2px solid ${color};` +
            'display:flex;align-items:center;justify-content:center;' +
            'font-size:16px;';
        badge.textContent = item.rarity === 'legendary' ? '\u2605' : item.rarity === 'epic' ? '\u2666' : item.rarity === 'rare' ? '\u25C6' : '\u25CF';
        badge.style.color = color;
        toast.appendChild(badge);

        // Text content
        const textWrap = document.createElement('div');
        textWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;';

        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-size:13px;font-weight:bold;color:white;letter-spacing:0.3px;';
        nameEl.textContent = item.name;
        textWrap.appendChild(nameEl);

        const descEl = document.createElement('div');
        descEl.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.6);line-height:1.3;';
        descEl.textContent = item.description;
        textWrap.appendChild(descEl);

        toast.appendChild(textWrap);

        // XP badge
        const xpEl = document.createElement('div');
        xpEl.style.cssText =
            `font-size:12px;font-weight:bold;color:${color};flex-shrink:0;` +
            'white-space:nowrap;';
        xpEl.textContent = `+${item.xp} XP`;
        toast.appendChild(xpEl);

        this.container.appendChild(toast);

        // Trigger callback
        this.onToastShow?.();

        // Animate in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.style.transform = 'translateX(0)';
                toast.style.opacity = '1';
            });
        });

        // Animate out after 2.5s
        setTimeout(() => {
            toast.style.transform = 'translateX(120%)';
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
                this.processQueue();
            }, 400);
        }, 2500);
    }

    destroy(): void {
        this.container.remove();
        this.queue.length = 0;
        this.showing = false;
        instance = null;
    }
}
