type OnboardingEvent =
    | 'move'
    | 'sprint'
    | 'throw'
    | 'catch_or_switch'
    | 'score';

interface OnboardingStep {
    id: OnboardingEvent;
    title: string;
    instruction: string;
    touchInstruction?: string;
}

const STEPS: OnboardingStep[] = [
    {
        id: 'move',
        title: 'Step 1/5: Move',
        instruction: 'Use WASD (or arrows) to move your player.',
        touchInstruction: 'Use the left joystick to move your player.',
    },
    {
        id: 'sprint',
        title: 'Step 2/5: Sprint',
        instruction: 'Hold SHIFT while moving to sprint.',
        touchInstruction: 'Hold the SPRINT button while moving to run faster.',
    },
    {
        id: 'throw',
        title: 'Step 3/5: Throwing',
        instruction: 'Hold LEFT MOUSE to charge, release to throw.',
        touchInstruction: 'Hold the THROW button to charge, release to throw.',
    },
    {
        id: 'catch_or_switch',
        title: 'Step 4/5: Catch / Switch',
        instruction: 'Catch a disc or press E to switch to the nearest player.',
        touchInstruction: 'Catch a disc or tap SWITCH to control the nearest player.',
    },
    {
        id: 'score',
        title: 'Step 5/5: Goal!',
        instruction: 'Catch the disc in the colored endzone to score and win!',
        touchInstruction: 'Catch the disc in the colored endzone to score!',
    },
];

export class FirstMatchOnboarding {
    private root: HTMLDivElement;
    private card: HTMLDivElement;
    private stepIndex = 0;
    private active = true;
    private isTouch = false;
    private onComplete?: () => void;

    constructor(container: HTMLElement, isTouch: boolean, onComplete?: () => void) {
        this.onComplete = onComplete;
        this.isTouch = isTouch;
        this.root = document.createElement('div');
        this.root.style.cssText =
            'position:absolute;left:50%;bottom:max(140px, 18%);transform:translateX(-50%);' +
            'z-index:100;pointer-events:none;width:min(94vw,400px);opacity:0;transition:opacity 0.4s, transform 0.4s;';
        
        this.card = document.createElement('div');
        this.card.style.cssText =
            'padding:16px 20px;border-radius:16px;border:1px solid rgba(255,255,255,0.22);' +
            'background:linear-gradient(145deg,rgba(7,20,38,0.92),rgba(12,28,52,0.88));' +
            'backdrop-filter:blur(8px);box-shadow:0 20px 50px rgba(0,0,0,0.6);' +
            'font-family:monospace;color:white;text-align:center;';
        
        this.root.appendChild(this.card);
        container.appendChild(this.root);
        
        // Trigger entrance animation
        requestAnimationFrame(() => {
            this.root.style.opacity = '1';
            this.root.style.transform = 'translateX(-50%) translateY(-10px)';
        });

        this.render();
    }

    isActive(): boolean {
        return this.active;
    }

    check(event: OnboardingEvent): void {
        if (!this.active) return;
        const current = STEPS[this.stepIndex];
        if (!current || current.id !== event) return;

        // Subtle flash effect on progress
        this.card.style.borderColor = 'rgba(255, 209, 102, 0.8)';
        setTimeout(() => {
            if (this.active) this.card.style.borderColor = 'rgba(255,255,255,0.22)';
        }, 300);

        this.stepIndex += 1;
        if (this.stepIndex >= STEPS.length) {
            this.complete();
            return;
        }
        this.render();
    }

    destroy(): void {
        this.active = false;
        this.root.remove();
    }

    private render(): void {
        const current = STEPS[this.stepIndex];
        if (!current) return;
        
        const instruction = this.isTouch && current.touchInstruction 
            ? current.touchInstruction 
            : current.instruction;

        this.card.innerHTML = `
<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px;">
  <strong style="font-size:11px;letter-spacing:0.12em;color:#ffd166;text-transform:uppercase;opacity:0.9;">Match Tutorial</strong>
  <span style="font-size:11px;color:rgba(255,255,255,0.6);">${this.stepIndex + 1} / ${STEPS.length}</span>
</div>
<div style="margin-bottom:6px;font-size:17px;font-weight:bold;letter-spacing:0.02em;color:#fff;">${escapeHtml(current.title.split(': ')[1])}</div>
<div style="font-size:13px;line-height:1.45;color:rgba(255,255,255,0.92);">${escapeHtml(instruction)}</div>
<div style="margin-top:12px;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
  <div style="height:100%;width:${((this.stepIndex) / STEPS.length) * 100}%;background:#ffd166;transition:width 0.4s ease-out;"></div>
</div>`;
    }

    private complete(): void {
        this.active = false;
        this.card.style.borderColor = '#8ff2a6';
        this.card.innerHTML = `
<div style="font-size:11px;letter-spacing:0.12em;color:#8ff2a6;text-transform:uppercase;margin-bottom:8px;">Tutorial Complete</div>
<div style="font-size:16px;font-weight:bold;color:#fff;margin-bottom:4px;">Ready to Play!</div>
<div style="font-size:13px;color:rgba(255,255,255,0.85);">Onboarding goals met. Good luck!</div>
<div style="margin-top:10px;height:3px;background:#8ff2a6;border-radius:2px;"></div>`;
        
        window.setTimeout(() => {
            this.root.style.opacity = '0';
            this.root.style.transform = 'translateX(-50%) translateY(10px)';
            window.setTimeout(() => {
                this.root.remove();
                this.onComplete?.();
            }, 400);
        }, 2200);
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
