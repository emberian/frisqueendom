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
}

const STEPS: OnboardingStep[] = [
    {
        id: 'move',
        title: 'Step 1/5: Move',
        instruction: 'Use WASD (or left stick) to move your player.',
    },
    {
        id: 'sprint',
        title: 'Step 2/5: Sprint',
        instruction: 'Hold Shift while moving to sprint.',
    },
    {
        id: 'throw',
        title: 'Step 3/5: Throw',
        instruction: 'Hold left mouse to charge, release to throw.',
    },
    {
        id: 'catch_or_switch',
        title: 'Step 4/5: Catch / Switch',
        instruction: 'Catch a disc or press E to switch players.',
    },
    {
        id: 'score',
        title: 'Step 5/5: Score',
        instruction: 'Catch in the endzone to score and finish onboarding.',
    },
];

export class FirstMatchOnboarding {
    private root: HTMLDivElement;
    private card: HTMLDivElement;
    private stepIndex = 0;
    private active = true;
    private onComplete?: () => void;

    constructor(container: HTMLElement, onComplete?: () => void) {
        this.onComplete = onComplete;
        this.root = document.createElement('div');
        this.root.style.cssText =
            'position:absolute;left:50%;bottom:112px;transform:translateX(-50%);' +
            'z-index:55;pointer-events:none;width:min(92vw,440px);';
        this.card = document.createElement('div');
        this.card.style.cssText =
            'padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.28);' +
            'background:linear-gradient(140deg,rgba(11,22,41,0.9),rgba(19,42,70,0.9));' +
            'box-shadow:0 14px 36px rgba(0,0,0,0.35);font-family:monospace;color:white;';
        this.root.appendChild(this.card);
        container.appendChild(this.root);
        this.render();
    }

    isActive(): boolean {
        return this.active;
    }

    check(event: OnboardingEvent): void {
        if (!this.active) return;
        const current = STEPS[this.stepIndex];
        if (!current || current.id !== event) return;

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
        this.card.innerHTML = `
<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
  <strong style="font-size:12px;letter-spacing:0.08em;color:#ffd166;text-transform:uppercase;">First Match Onboarding</strong>
  <span style="font-size:11px;color:rgba(255,255,255,0.72);">${this.stepIndex + 1}/${STEPS.length}</span>
</div>
<div style="margin-top:6px;font-size:14px;font-weight:bold;">${escapeHtml(current.title)}</div>
<div style="margin-top:4px;font-size:12px;color:rgba(255,255,255,0.86);">${escapeHtml(current.instruction)}</div>`;
    }

    private complete(): void {
        this.active = false;
        this.card.innerHTML = `
<div style="font-size:12px;letter-spacing:0.08em;color:#8ff2a6;text-transform:uppercase;">Onboarding Complete</div>
<div style="margin-top:4px;font-size:12px;color:rgba(255,255,255,0.88);">You are ready for full matches.</div>`;
        window.setTimeout(() => {
            this.root.remove();
            this.onComplete?.();
        }, 1600);
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
