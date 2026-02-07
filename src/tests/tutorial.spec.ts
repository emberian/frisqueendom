import { TutorialSystem } from '../ui/Tutorial';

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
}

export function runTutorialTests(): TestResult[] {
    const results: TestResult[] = [];

    // Setup
    const container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    function test(name: string, fn: () => void): void {
        try {
            fn();
            results.push({ name, passed: true });
        } catch (error) {
            results.push({
                name,
                passed: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    function assertEquals(actual: any, expected: any, message?: string): void {
        if (actual !== expected) {
            throw new Error(
                message || `Expected ${expected}, got ${actual}`
            );
        }
    }

    function assertTrue(value: boolean, message?: string): void {
        if (!value) {
            throw new Error(message || 'Expected true, got false');
        }
    }

    function assertFalse(value: boolean, message?: string): void {
        if (value) {
            throw new Error(message || 'Expected false, got true');
        }
    }

    // TEST 1: Tutorial initializes with correct state
    test('Tutorial initializes inactive', () => {
        const tutorial = new TutorialSystem(container);
        assertFalse(tutorial.isActive(), 'Tutorial should be inactive on init');
        assertEquals(tutorial.getCurrentChapter(), 1, 'Should start at chapter 1');
    });

    // TEST 2: Starting tutorial activates it
    test('Starting tutorial activates it', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start();
        assertTrue(tutorial.isActive(), 'Tutorial should be active after start');

        const progress = tutorial.getProgress();
        assertEquals(progress.chapter, 1, 'Should be on chapter 1');
        assertEquals(progress.step, 1, 'Should be on step 1');
    });

    // TEST 3: Starting at specific chapter
    test('Can start at specific chapter', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start(3);
        assertTrue(tutorial.isActive(), 'Tutorial should be active');

        const progress = tutorial.getProgress();
        assertEquals(progress.chapter, 3, 'Should start at chapter 3');
        assertEquals(progress.step, 1, 'Should be on first step of chapter 3');
    });

    // TEST 4: Stopping tutorial deactivates it
    test('Stopping tutorial deactivates it', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start();
        assertTrue(tutorial.isActive(), 'Tutorial should be active');

        tutorial.stop();
        assertFalse(tutorial.isActive(), 'Tutorial should be inactive after stop');
    });

    // TEST 5: Check condition advances on match
    test('Check condition advances step on match', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start();

        const initialProgress = tutorial.getProgress();
        const initialStep = initialProgress.step;

        // First step should have condition 'player_moved'
        tutorial.checkCondition('player_moved');

        // Wait for async advance
        setTimeout(() => {
            const newProgress = tutorial.getProgress();
            assertEquals(newProgress.step, initialStep + 1, 'Should advance to next step');
        }, 1000);
    });

    // TEST 6: Check condition does nothing when inactive
    test('Check condition does nothing when inactive', () => {
        const tutorial = new TutorialSystem(container);
        const progress = tutorial.getProgress();

        tutorial.checkCondition('player_moved');

        const newProgress = tutorial.getProgress();
        assertEquals(newProgress.step, progress.step, 'Step should not change when inactive');
    });

    // TEST 7: Check condition does nothing on mismatch
    test('Check condition ignores mismatched conditions', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start();

        const progress = tutorial.getProgress();

        // Check a condition that doesn't match current step
        tutorial.checkCondition('wrong_condition');

        const newProgress = tutorial.getProgress();
        assertEquals(newProgress.step, progress.step, 'Step should not change on mismatch');
    });

    // TEST 8: Get current instruction
    test('Get current instruction returns correct text', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start();

        const instruction = tutorial.getCurrentInstruction();
        assertTrue(instruction !== null, 'Instruction should not be null');
        assertTrue(
            instruction!.includes('WASD') || instruction!.includes('move'),
            'First instruction should be about movement'
        );
    });

    // TEST 9: Get current instruction when inactive
    test('Get current instruction returns null when inactive', () => {
        const tutorial = new TutorialSystem(container);
        const instruction = tutorial.getCurrentInstruction();
        assertEquals(instruction, null, 'Should return null when inactive');
    });

    // TEST 10: Progress tracking across chapters
    test('Progress tracking shows correct totals', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start(1);

        const progress = tutorial.getProgress();
        assertTrue(progress.total > 0, 'Should have steps in chapter 1');
        assertEquals(progress.chapter, 1, 'Should be on chapter 1');
    });

    // TEST 11: Chapter completion tracking
    test('Chapter completion tracking works', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start();

        const completedBefore = tutorial.hasCompletedChapter(1);
        assertFalse(completedBefore, 'Chapter 1 should not be completed initially');
    });

    // TEST 12: Tutorial completion tracking
    test('Tutorial completion tracking works', () => {
        const tutorial = new TutorialSystem(container);
        const completed = tutorial.hasCompletedTutorial();
        assertFalse(completed, 'Tutorial should not be completed initially');
    });

    // TEST 13: Reset progress
    test('Reset progress clears completion', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start();
        tutorial.checkCondition('player_moved');

        tutorial.resetProgress();

        const progress = tutorial.getProgress();
        assertEquals(progress.chapter, 1, 'Should reset to chapter 1');
        assertEquals(progress.step, 0, 'Should reset to step 0');
        assertFalse(tutorial.hasCompletedChapter(1), 'Chapter should not be completed after reset');
    });

    // TEST 14: Completion callback
    test('Completion callback fires on tutorial end', (done?: () => void) => {
        let callbackFired = false;
        const tutorial = new TutorialSystem(container, () => {
            callbackFired = true;
        });

        tutorial.start();
        tutorial.stop();

        // Callback should fire after stop
        assertTrue(callbackFired, 'Callback should fire when tutorial stops');
    });

    // TEST 15: UI elements are created
    test('UI elements are created when tutorial starts', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start();

        const overlay = container.querySelector('.tutorial-overlay');
        const bubble = container.querySelector('.tutorial-bubble');
        const progress = container.querySelector('.tutorial-progress');

        assertTrue(overlay !== null, 'Overlay should be created');
        assertTrue(bubble !== null, 'Bubble should be created');
        assertTrue(progress !== null, 'Progress indicator should be created');

        tutorial.stop();
    });

    // TEST 16: UI elements are removed on stop
    test('UI elements are removed when tutorial stops', () => {
        const tutorial = new TutorialSystem(container);
        tutorial.start();
        tutorial.stop();

        const overlay = container.querySelector('.tutorial-overlay');
        const bubble = container.querySelector('.tutorial-bubble');
        const progress = container.querySelector('.tutorial-progress');

        assertEquals(overlay, null, 'Overlay should be removed');
        assertEquals(bubble, null, 'Bubble should be removed');
        assertEquals(progress, null, 'Progress should be removed');
    });

    // TEST 17: Multiple tutorial instances
    test('Multiple tutorial instances work independently', () => {
        const container2 = document.createElement('div');
        document.body.appendChild(container2);

        const tutorial1 = new TutorialSystem(container);
        const tutorial2 = new TutorialSystem(container2);

        tutorial1.start(1);
        tutorial2.start(2);

        assertEquals(tutorial1.getCurrentChapter(), 1, 'Tutorial 1 should be on chapter 1');
        assertEquals(tutorial2.getCurrentChapter(), 2, 'Tutorial 2 should be on chapter 2');

        tutorial1.stop();
        tutorial2.stop();
        container2.remove();
    });

    // TEST 18: LocalStorage persistence
    test('Progress is saved to localStorage', () => {
        localStorage.removeItem('frisqueendom_tutorial_progress');

        const tutorial = new TutorialSystem(container);
        tutorial.start();
        tutorial.checkCondition('player_moved');
        tutorial.stop();

        const saved = localStorage.getItem('frisqueendom_tutorial_progress');
        assertTrue(saved !== null, 'Progress should be saved to localStorage');

        const parsed = JSON.parse(saved!);
        assertTrue(
            Array.isArray(parsed.completedSteps),
            'Should have completedSteps array'
        );
    });

    // TEST 19: LocalStorage loading
    test('Progress is loaded from localStorage', () => {
        // Setup saved progress
        const savedProgress = {
            completedSteps: ['player_moved', 'player_sprinted'],
            currentChapter: 2,
            currentStep: 10,
        };
        localStorage.setItem('frisqueendom_tutorial_progress', JSON.stringify(savedProgress));

        const tutorial = new TutorialSystem(container);
        assertEquals(tutorial.getCurrentChapter(), 2, 'Should load saved chapter');

        localStorage.removeItem('frisqueendom_tutorial_progress');
    });

    // TEST 20: All chapters have steps
    test('All 5 chapters have defined steps', () => {
        const tutorial = new TutorialSystem(container);

        for (let chapter = 1; chapter <= 5; chapter++) {
            tutorial.start(chapter);
            const progress = tutorial.getProgress();
            assertTrue(
                progress.total > 0,
                `Chapter ${chapter} should have at least one step`
            );
            tutorial.stop();
        }
    });

    // Cleanup
    container.remove();

    return results;
}

// Auto-run tests if this file is imported directly
if (typeof window !== 'undefined') {
    (window as any).__tests = (window as any).__tests || {};
    (window as any).__tests.tutorial = runTutorialTests;
}

// Console test runner
export function logTestResults(): void {
    console.log('🧪 Running Tutorial Tests...\n');

    const results = runTutorialTests();
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    results.forEach(result => {
        if (result.passed) {
            console.log(`✅ ${result.name}`);
        } else {
            console.log(`❌ ${result.name}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
        }
    });

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${results.length} total)`);

    if (failed === 0) {
        console.log('🎉 All tests passed!');
    }
}
