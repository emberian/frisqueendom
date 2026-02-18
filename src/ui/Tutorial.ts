export interface TutorialStep {
    chapter: number;
    step: number;
    title: string;
    instruction: string;
    highlight?: string;
    completionCondition: string;
    skipLabel?: string;
}

export class TutorialSystem {
    private container: HTMLElement;
    private currentChapter = 0;
    private currentStep = 0;
    private active = false;
    private overlay: HTMLDivElement | null = null;
    private bubbleEl: HTMLDivElement | null = null;
    private progressEl: HTMLDivElement | null = null;
    private steps: TutorialStep[] = [];
    private completedSteps = new Set<string>();
    private onComplete?: () => void;
    private animationFrame: number | null = null;
    private advancePending = false;

    constructor(container: HTMLElement, onComplete?: () => void) {
        this.container = container;
        this.onComplete = onComplete;
        this.steps = this.defineMiniSteps();
        this.loadProgress();
    }

    /** 5-step mini-tutorial — enough to start playing immediately. */
    private defineMiniSteps(): TutorialStep[] {
        return [
            {
                chapter: 1, step: 1,
                title: "Move",
                instruction: "Use WASD to move. Hold SHIFT to sprint!",
                completionCondition: 'player_moved',
            },
            {
                chapter: 1, step: 2,
                title: "Throw",
                instruction: "Hold LEFT CLICK to charge, then release to throw. Right-click for forehand!",
                completionCondition: 'disc_thrown',
            },
            {
                chapter: 1, step: 3,
                title: "Catch",
                instruction: "Walk near the disc to catch it. Your teammates catch automatically too!",
                completionCondition: 'disc_caught',
            },
            {
                chapter: 1, step: 4,
                title: "Score!",
                instruction: "Catch the disc in the END ZONE to score. If it hits the ground, the other team gets it!",
                completionCondition: 'point_scored',
            },
            {
                chapter: 1, step: 5,
                title: "You're Ready!",
                instruction: "That's it! Have fun out there!",
                completionCondition: 'tutorial_completed',
                skipLabel: 'Start Playing',
            },
        ];
    }

    /** Full 44-step advanced tutorial for players who want to learn everything. */
    private defineAdvancedSteps(): TutorialStep[] {
        return [
            // CHAPTER 1: BASICS
            { chapter: 1, step: 1, title: "Welcome to FrisQueendom!", instruction: "Let's learn the basics. Use WASD keys to move around the field.", completionCondition: 'player_moved' },
            { chapter: 1, step: 2, title: "Sprint", instruction: "Hold SHIFT while moving to sprint faster. Try it now!", completionCondition: 'player_sprinted' },
            { chapter: 1, step: 3, title: "Stamina Management", instruction: "Notice the stamina bar below. Sprinting drains stamina, and you'll slow down when it's empty.", highlight: '.stamina-bar', completionCondition: 'stamina_drained' },
            { chapter: 1, step: 4, title: "Pick Up the Disc", instruction: "Walk near the disc on the ground to pick it up automatically.", completionCondition: 'disc_picked_up' },
            { chapter: 1, step: 5, title: "Charging a Throw", instruction: "Hold LEFT MOUSE button to charge up your throw. You'll see the power meter fill.", highlight: '.throw-power-indicator', completionCondition: 'throw_charged' },
            { chapter: 1, step: 6, title: "Release!", instruction: "Release the mouse button to throw the disc! More power = longer distance.", completionCondition: 'disc_thrown' },
            { chapter: 1, step: 7, title: "Catching", instruction: "Walk near the disc in the air or on the ground to catch it automatically.", completionCondition: 'disc_caught' },
            { chapter: 1, step: 8, title: "Scoring", instruction: "Catch the disc in the END ZONE (the colored area at each end) to score a point!", completionCondition: 'point_scored', skipLabel: 'Skip to next chapter' },
            // CHAPTER 2: THROWING DEPTH
            { chapter: 2, step: 1, title: "Forehand Throw", instruction: "Hold RIGHT MOUSE + LEFT MOUSE together to throw a forehand (flick). It curves opposite to backhand!", completionCondition: 'forehand_thrown' },
            { chapter: 2, step: 2, title: "Backhand vs Forehand", instruction: "Backhand (left mouse only) curves left for right-handers. Forehand curves right. Try both!", completionCondition: 'both_throws_used' },
            { chapter: 2, step: 3, title: "Hyzer Angle", instruction: "Use SCROLL WHEEL UP to add hyzer (tilt disc right). This makes the disc curve MORE in its natural direction.", highlight: '.hyzer-indicator', completionCondition: 'hyzer_adjusted' },
            { chapter: 2, step: 4, title: "Anhyzer Angle", instruction: "SCROLL WHEEL DOWN adds anhyzer (tilt left). This makes the disc turn AGAINST its natural curve, then fade back.", completionCondition: 'anhyzer_adjusted' },
            { chapter: 2, step: 5, title: "Wind Awareness", instruction: "The wind arrow shows direction and strength. Headwind makes the disc more overstable (fade harder).", highlight: '.wind-indicator', completionCondition: 'wind_observed' },
            { chapter: 2, step: 6, title: "Trajectory Preview", instruction: "While charging, watch the arc preview. It shows where your throw will go (accounting for wind!).", highlight: '.trajectory-preview', completionCondition: 'trajectory_previewed' },
            { chapter: 2, step: 7, title: "Practice Makes Perfect", instruction: "Try different combinations: power + hyzer, soft + anhyzer, forehand in wind. Experiment!", completionCondition: 'multiple_throws_practiced', skipLabel: 'Got it!' },
            // CHAPTER 3: THE GAME
            { chapter: 3, step: 1, title: "Turnovers", instruction: "After you score OR if the disc hits the ground, possession changes to the other team.", completionCondition: 'turnover_witnessed' },
            { chapter: 3, step: 2, title: "Stall Count", instruction: "You have 10 seconds to throw. The defender will count 'Stalling 1... 2... 3...' Watch the counter!", highlight: '.stall-count', completionCondition: 'stall_count_heard' },
            { chapter: 3, step: 3, title: "Disc Space", instruction: "Defenders can't touch you, but they can block your throwing lane. Position yourself for a clear throw!", completionCondition: 'defender_avoided' },
            { chapter: 3, step: 4, title: "No Contact Defense", instruction: "Ultimate is non-contact. You can't bump or grab opponents. Stay 1 disc-length away when defending.", completionCondition: 'legal_defense_performed' },
            { chapter: 3, step: 5, title: "Spirit of the Game", instruction: "There are no referees - players call their own fouls! Honesty and respect are core to Ultimate.", completionCondition: 'spirit_acknowledged' },
            { chapter: 3, step: 6, title: "Calling Fouls", instruction: "Press F to call a foul if contact occurs. Play stops and you discuss what happened.", completionCondition: 'foul_called', skipLabel: 'Next chapter' },
            // CHAPTER 4: ADVANCED
            { chapter: 4, step: 1, title: "Making Cuts", instruction: "Without the disc, sprint to open space to receive a pass. Cut AWAY from defenders!", completionCondition: 'cut_made' },
            { chapter: 4, step: 2, title: "Timing Your Cut", instruction: "Watch the thrower! Cut when they're ready to throw, not too early. Sprint, then slow to catch.", completionCondition: 'timed_cut_made' },
            { chapter: 4, step: 3, title: "Give and Go", instruction: "After throwing, immediately cut to a new position. Don't stand still!", completionCondition: 'give_and_go_performed' },
            { chapter: 4, step: 4, title: "Team Coordination", instruction: "Only 1-2 players should cut at once. If someone else is cutting, clear out or prepare for a continuation.", completionCondition: 'team_coordination_shown' },
            { chapter: 4, step: 5, title: "The Hammer", instruction: "Hold RIGHT MOUSE + SPACE for an overhead hammer throw. It flies upside-down and drops straight down!", completionCondition: 'hammer_thrown' },
            { chapter: 4, step: 6, title: "The Scoober", instruction: "Hold LEFT MOUSE + SPACE for a scoober - an upside-down forehand. Great for getting over defenders!", completionCondition: 'scoober_thrown' },
            { chapter: 4, step: 7, title: "Layout Catch", instruction: "Press SPACE while running to dive (layout) for the disc. Risk vs reward - if you miss, it's a turnover!", completionCondition: 'layout_attempted' },
            { chapter: 4, step: 8, title: "Reading the Disc", instruction: "Watch the disc's spin and angle in flight. Outside edge = more fade. Practice predicting where it'll land!", completionCondition: 'disc_reading_practiced', skipLabel: 'Final chapter!' },
            // CHAPTER 5: STRATEGY
            { chapter: 5, step: 1, title: "Vertical Stack Offense", instruction: "Form a line down the middle. Cutters take turns going deep or under. This creates isolated 1v1s.", completionCondition: 'vertical_stack_formed' },
            { chapter: 5, step: 2, title: "Horizontal Stack", instruction: "Spread across the field horizontally. Cut to the empty spaces on the sides. Great against zones!", completionCondition: 'horizontal_stack_formed' },
            { chapter: 5, step: 3, title: "Handler Movement", instruction: "As a handler (thrower), move side-to-side to find throwing lanes. Reset passes keep possession alive!", completionCondition: 'handler_movement_shown' },
            { chapter: 5, step: 4, title: "Man Defense", instruction: "On defense, pick one opponent and shadow them. Stay between them and the disc. Force them where you want!", completionCondition: 'man_defense_played' },
            { chapter: 5, step: 5, title: "Zone Defense", instruction: "Instead of guarding a person, guard an AREA. Form a wall - cup, wings, and deeps. Communicate!", completionCondition: 'zone_defense_played' },
            { chapter: 5, step: 6, title: "Force Side", instruction: "Force the thrower to one side of the field (usually forehand or backhand). Your team covers the other side!", completionCondition: 'force_applied' },
            { chapter: 5, step: 7, title: "Throwing Into Wind", instruction: "Strong headwind? Throw lower and with more hyzer. The wind will float it. Avoid high releases!", completionCondition: 'wind_throw_mastered' },
            { chapter: 5, step: 8, title: "Throwing Downwind", instruction: "Tailwind? Throw higher and watch for the disc to keep drifting. Give receivers more space!", completionCondition: 'downwind_throw_mastered' },
            { chapter: 5, step: 9, title: "Crosswind Strategy", instruction: "Crosswind pushes the disc sideways. Aim upwind of your target. Use IO/OI throws to fight or use the wind!", completionCondition: 'crosswind_mastered' },
            { chapter: 5, step: 10, title: "You're Ready!", instruction: "You've mastered FrisQueendom! Now go out there and play. Remember: have fun and respect the spirit!", completionCondition: 'tutorial_completed', skipLabel: 'Finish Tutorial' },
        ];
    }

    /** Switch to the full advanced tutorial (e.g. from Settings). */
    startAdvanced(chapter?: number): void {
        this.steps = this.defineAdvancedSteps();
        this.start(chapter);
    }

    start(chapter?: number): void {
        const maxChapter = Math.max(...this.steps.map(s => s.chapter));
        if (chapter !== undefined && chapter >= 1 && chapter <= maxChapter) {
            this.currentChapter = chapter;
            this.currentStep = 0;
            // Find the first step of this chapter
            const chapterSteps = this.steps.filter(s => s.chapter === chapter);
            if (chapterSteps.length > 0) {
                const globalIndex = this.steps.indexOf(chapterSteps[0]);
                this.currentStep = globalIndex;
            }
        } else {
            this.currentChapter = 1;
            this.currentStep = 0;
        }

        this.active = true;
        this.renderStep();
    }

    stop(): void {
        this.active = false;
        this.destroy();
        this.saveProgress();
    }

    checkCondition(conditionKey: string): void {
        if (!this.active || this.advancePending) return;

        const currentStepData = this.steps[this.currentStep];
        if (!currentStepData) return;

        if (currentStepData.completionCondition === conditionKey) {
            this.completedSteps.add(conditionKey);
            this.advancePending = true;
            setTimeout(() => {
                this.advancePending = false;
                this.advance();
            }, 800);
        }
    }

    isActive(): boolean {
        return this.active;
    }

    getCurrentInstruction(): string | null {
        if (!this.active || !this.steps[this.currentStep]) return null;
        return this.steps[this.currentStep].instruction;
    }

    getCurrentChapter(): number {
        return this.currentChapter;
    }

    getProgress(): { chapter: number; step: number; total: number } {
        const chapterSteps = this.steps.filter(s => s.chapter === this.currentChapter);
        const currentInChapter = chapterSteps.findIndex(s =>
            s.chapter === this.steps[this.currentStep]?.chapter &&
            s.step === this.steps[this.currentStep]?.step
        );

        return {
            chapter: this.currentChapter,
            step: currentInChapter + 1,
            total: chapterSteps.length,
        };
    }

    private advance(): void {
        this.currentStep++;
        this.advancePending = false;

        if (this.currentStep >= this.steps.length) {
            // Tutorial complete!
            this.stop();
            if (this.onComplete) this.onComplete();
            return;
        }

        const nextStep = this.steps[this.currentStep];
        if (nextStep.chapter !== this.currentChapter) {
            this.currentChapter = nextStep.chapter;
        }

        this.renderStep();
    }

    private skip(): void {
        this.advancePending = false;

        // Find the max chapter in current step set
        const maxChapter = Math.max(...this.steps.map(s => s.chapter));

        // Skip to next chapter or end
        const nextChapter = this.currentChapter + 1;
        if (nextChapter > maxChapter) {
            this.stop();
            if (this.onComplete) this.onComplete();
            return;
        }

        this.currentChapter = nextChapter;
        const nextChapterSteps = this.steps.filter(s => s.chapter === nextChapter);
        if (nextChapterSteps.length > 0) {
            this.currentStep = this.steps.indexOf(nextChapterSteps[0]);
            this.renderStep();
        } else {
            this.stop();
            if (this.onComplete) this.onComplete();
        }
    }

    private renderStep(): void {
        this.destroy();

        const stepData = this.steps[this.currentStep];
        if (!stepData) return;

        this.createOverlay(stepData);
        this.createBubble(stepData);
        this.createProgressIndicator(stepData);

        if (stepData.highlight) {
            this.highlightElement(stepData.highlight);
        }

        // Auto-dismiss the final "You're Ready!" step after 3 seconds
        if (stepData.completionCondition === 'tutorial_completed') {
            setTimeout(() => {
                if (this.active && this.steps[this.currentStep]?.completionCondition === 'tutorial_completed') {
                    this.stop();
                    if (this.onComplete) this.onComplete();
                }
            }, 3000);
        }
    }

    private createOverlay(stepData: TutorialStep): void {
        this.overlay = document.createElement('div');
        this.overlay.className = 'tutorial-overlay';
        const isMobileOverlay = window.matchMedia('(pointer: coarse)').matches
            || window.innerWidth <= 1024;
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, ${isMobileOverlay ? '0.3' : '0.6'});
            z-index: 9998;
            pointer-events: none;
        `;
        this.container.appendChild(this.overlay);
    }

    private createBubble(stepData: TutorialStep): void {
        this.bubbleEl = document.createElement('div');
        this.bubbleEl.className = 'tutorial-bubble';
        const isMobile = window.matchMedia('(pointer: coarse)').matches
            || window.innerWidth <= 1024;
        this.bubbleEl.style.cssText = `
            position: fixed;
            ${isMobile ? 'top: 12px;' : 'top: 50%; transform: translateY(-50%);'}
            left: 50%;
            transform: translateX(-50%)${isMobile ? '' : ' translateY(-50%)'};
            background: white;
            color: #333;
            padding: ${isMobile ? '14px 18px' : '24px'};
            border-radius: ${isMobile ? '12px' : '16px'};
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            max-width: ${isMobile ? '92vw' : '400px'};
            z-index: 10000;
            pointer-events: auto;
            font-family: Arial, sans-serif;
            font-size: ${isMobile ? '14px' : '16px'};
        `;

        const title = document.createElement('h3');
        title.textContent = stepData.title;
        title.style.cssText = `
            margin: 0 0 12px 0;
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
        `;

        const instruction = document.createElement('p');
        instruction.textContent = stepData.instruction;
        instruction.style.cssText = `
            margin: 0 0 20px 0;
            font-size: 16px;
            line-height: 1.5;
            color: #555;
        `;

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        `;

        const skipBtn = document.createElement('button');
        skipBtn.textContent = stepData.skipLabel || 'Skip Chapter';
        skipBtn.style.cssText = `
            padding: 10px 20px;
            background: #95a5a6;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: background 0.2s;
        `;
        skipBtn.onmouseenter = () => skipBtn.style.background = '#7f8c8d';
        skipBtn.onmouseleave = () => skipBtn.style.background = '#95a5a6';
        skipBtn.onclick = () => this.skip();

        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Got it!';
        nextBtn.style.cssText = `
            padding: 10px 20px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: background 0.2s;
        `;
        nextBtn.onmouseenter = () => nextBtn.style.background = '#2980b9';
        nextBtn.onmouseleave = () => nextBtn.style.background = '#3498db';
        nextBtn.onclick = () => this.advance();

        buttonContainer.appendChild(skipBtn);
        buttonContainer.appendChild(nextBtn);

        this.bubbleEl.appendChild(title);
        this.bubbleEl.appendChild(instruction);
        this.bubbleEl.appendChild(buttonContainer);

        this.container.appendChild(this.bubbleEl);

        // Add pointer triangle
        this.addPointerTriangle(stepData);
    }

    private addPointerTriangle(stepData: TutorialStep): void {
        if (!stepData.highlight || !this.bubbleEl) return;

        const targetEl = document.querySelector(stepData.highlight);
        if (!targetEl) return;

        const pointer = document.createElement('div');
        pointer.className = 'tutorial-pointer';
        pointer.style.cssText = `
            position: absolute;
            width: 0;
            height: 0;
            border-left: 12px solid transparent;
            border-right: 12px solid transparent;
            border-top: 12px solid white;
            bottom: -12px;
            left: 50%;
            transform: translateX(-50%);
        `;
        this.bubbleEl.appendChild(pointer);

        // Position bubble near target
        const targetRect = targetEl.getBoundingClientRect();
        const bubbleRect = this.bubbleEl.getBoundingClientRect();

        let top = targetRect.bottom + 20;
        let left = targetRect.left + targetRect.width / 2;

        // Adjust if off-screen
        if (top + bubbleRect.height > window.innerHeight) {
            top = targetRect.top - bubbleRect.height - 20;
            pointer.style.borderTop = 'none';
            pointer.style.borderBottom = '12px solid white';
            pointer.style.bottom = 'auto';
            pointer.style.top = '-12px';
        }

        if (left + bubbleRect.width / 2 > window.innerWidth) {
            left = window.innerWidth - bubbleRect.width / 2 - 20;
        }

        if (left - bubbleRect.width / 2 < 0) {
            left = bubbleRect.width / 2 + 20;
        }

        this.bubbleEl.style.top = `${top}px`;
        this.bubbleEl.style.left = `${left}px`;
        this.bubbleEl.style.transform = 'translateX(-50%)';
    }

    private createProgressIndicator(stepData: TutorialStep): void {
        this.progressEl = document.createElement('div');
        this.progressEl.className = 'tutorial-progress';

        const progress = this.getProgress();
        this.progressEl.textContent = `Chapter ${progress.chapter} - Step ${progress.step}/${progress.total}`;

        this.progressEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: bold;
            z-index: 10001;
            pointer-events: none;
        `;

        this.container.appendChild(this.progressEl);
    }

    private highlightElement(selector: string): void {
        const targetEl = document.querySelector(selector) as HTMLElement;
        if (!targetEl) return;

        const rect = targetEl.getBoundingClientRect();

        const highlight = document.createElement('div');
        highlight.className = 'tutorial-highlight';
        highlight.style.cssText = `
            position: fixed;
            top: ${rect.top - 4}px;
            left: ${rect.left - 4}px;
            width: ${rect.width + 8}px;
            height: ${rect.height + 8}px;
            border: 3px solid #f39c12;
            border-radius: 8px;
            box-shadow: 0 0 16px rgba(243, 156, 18, 0.6);
            z-index: 9999;
            pointer-events: none;
            animation: tutorialPulse 1.5s infinite;
        `;

        // Add CSS animation
        if (!document.querySelector('#tutorial-styles')) {
            const style = document.createElement('style');
            style.id = 'tutorial-styles';
            style.textContent = `
                @keyframes tutorialPulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.02); }
                }
                @keyframes tutorialArrow {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
            `;
            document.head.appendChild(style);
        }

        this.container.appendChild(highlight);

        // Add animated arrow pointing to element
        this.addPointingArrow(rect);
    }

    private addPointingArrow(rect: DOMRect): void {
        const arrow = document.createElement('div');
        arrow.className = 'tutorial-arrow';
        arrow.style.cssText = `
            position: fixed;
            top: ${rect.top - 40}px;
            left: ${rect.left + rect.width / 2 - 15}px;
            width: 30px;
            height: 30px;
            border-left: 3px solid #f39c12;
            border-bottom: 3px solid #f39c12;
            transform: rotate(-45deg);
            z-index: 9999;
            pointer-events: none;
            animation: tutorialArrow 1.5s infinite;
        `;
        this.container.appendChild(arrow);
    }

    private destroy(): void {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.bubbleEl) {
            this.bubbleEl.remove();
            this.bubbleEl = null;
        }
        if (this.progressEl) {
            this.progressEl.remove();
            this.progressEl = null;
        }

        // Remove all highlights and arrows
        document.querySelectorAll('.tutorial-highlight, .tutorial-arrow').forEach(el => el.remove());

        if (this.animationFrame !== null) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    private saveProgress(): void {
        const progress = {
            completedSteps: Array.from(this.completedSteps),
            currentChapter: this.currentChapter,
            currentStep: this.currentStep,
        };
        localStorage.setItem('frisqueendom_tutorial_progress', JSON.stringify(progress));
    }

    private loadProgress(): void {
        const saved = localStorage.getItem('frisqueendom_tutorial_progress');
        if (saved) {
            try {
                const progress = JSON.parse(saved);
                this.completedSteps = new Set(progress.completedSteps || []);
                this.currentChapter = progress.currentChapter || 1;
                this.currentStep = progress.currentStep || 0;
            } catch (e) {
                console.warn('Failed to load tutorial progress:', e);
            }
        }
    }

    resetProgress(): void {
        this.completedSteps.clear();
        this.currentChapter = 1;
        this.currentStep = 0;
        localStorage.removeItem('frisqueendom_tutorial_progress');
    }

    hasCompletedChapter(chapter: number): boolean {
        const chapterSteps = this.steps.filter(s => s.chapter === chapter);
        return chapterSteps.every(step => this.completedSteps.has(step.completionCondition));
    }

    hasCompletedTutorial(): boolean {
        return this.completedSteps.has('tutorial_completed');
    }
}
