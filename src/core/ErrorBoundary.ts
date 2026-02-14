/**
 * Global error handler that catches unhandled errors and shows a recovery UI.
 * Installs listeners on window.onerror and window.onunhandledrejection.
 */
export class ErrorBoundary {
    private container: HTMLElement;
    private overlay: HTMLDivElement | null = null;
    private installed = false;

    private readonly handleError = (event: ErrorEvent): void => {
        this.showError(event.message, event.error?.stack ?? '');
    };

    private readonly handleRejection = (event: PromiseRejectionEvent): void => {
        const reason = event.reason;
        const message =
            reason instanceof Error
                ? reason.message
                : typeof reason === 'string'
                  ? reason
                  : 'Unhandled promise rejection';
        const stack =
            reason instanceof Error ? reason.stack ?? '' : String(reason);
        this.showError(message, stack);
    };

    constructor(container: HTMLElement) {
        this.container = container;
    }

    install(): void {
        if (this.installed) return;
        this.installed = true;
        window.addEventListener('error', this.handleError);
        window.addEventListener('unhandledrejection', this.handleRejection);
    }

    uninstall(): void {
        if (!this.installed) return;
        this.installed = false;
        window.removeEventListener('error', this.handleError);
        window.removeEventListener('unhandledrejection', this.handleRejection);
        this.dismissOverlay();
    }

    private showError(message: string, details: string): void {
        // Always log to console
        console.error('[ErrorBoundary]', message, '\n', details);

        // Skip HMR / Vite dev errors to avoid noise during development
        if (
            message.includes('[vite]') ||
            message.includes('[hmr]') ||
            message.includes('Failed to fetch dynamically imported module') ||
            message.includes('WebSocket connection failed') ||
            message.includes('Failed to connect to relay server')
        ) {
            return;
        }

        // Only show one overlay at a time
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.style.cssText =
            'position:fixed;inset:0;z-index:99999;' +
            'display:flex;align-items:center;justify-content:center;' +
            'background:rgba(4,6,14,0.92);backdrop-filter:blur(8px);' +
            'font-family:"Barlow Condensed","Trebuchet MS",sans-serif;' +
            'animation:errorFadeIn 0.3s ease;';

        // Inject keyframe if not already present
        if (!document.getElementById('error-boundary-keyframes')) {
            const style = document.createElement('style');
            style.id = 'error-boundary-keyframes';
            style.textContent =
                '@keyframes errorFadeIn{from{opacity:0}to{opacity:1}}';
            document.head.appendChild(style);
        }

        const panel = document.createElement('div');
        panel.style.cssText =
            'width:min(520px,90vw);border-radius:18px;' +
            'padding:32px 28px;' +
            'border:1px solid rgba(255,77,109,0.4);' +
            'background:linear-gradient(155deg,rgba(14,8,24,0.96),rgba(24,10,18,0.92));' +
            'box-shadow:0 24px 64px rgba(0,0,0,0.5),0 0 40px rgba(255,77,109,0.08);' +
            'color:#f0f4ff;';
        this.overlay.appendChild(panel);

        // Title
        const title = document.createElement('h2');
        title.textContent = 'Something went wrong';
        title.style.cssText =
            'margin:0 0 12px;font-family:"Bebas Neue","Impact",sans-serif;' +
            'font-size:1.8rem;letter-spacing:0.06em;text-transform:uppercase;' +
            'color:#ff6b82;';
        panel.appendChild(title);

        // Short message
        const msg = document.createElement('p');
        msg.textContent = message || 'An unexpected error occurred.';
        msg.style.cssText =
            'margin:0 0 16px;font-size:0.95rem;color:rgba(220,230,245,0.8);' +
            'line-height:1.4;word-break:break-word;';
        panel.appendChild(msg);

        // Collapsible details
        if (details) {
            const detailsEl = document.createElement('details');
            detailsEl.style.cssText = 'margin:0 0 20px;';

            const summary = document.createElement('summary');
            summary.textContent = 'Error details';
            summary.style.cssText =
                'cursor:pointer;font-size:0.82rem;color:rgba(180,195,220,0.65);' +
                'letter-spacing:0.08em;text-transform:uppercase;' +
                'padding:6px 0;outline:none;user-select:none;';
            detailsEl.appendChild(summary);

            const pre = document.createElement('pre');
            pre.textContent = details;
            pre.style.cssText =
                'margin:8px 0 0;padding:12px;border-radius:10px;' +
                'background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.06);' +
                'font-family:"Space Mono","Consolas",monospace;font-size:0.72rem;' +
                'color:rgba(200,210,230,0.7);overflow-x:auto;max-height:200px;' +
                'overflow-y:auto;white-space:pre-wrap;word-break:break-all;line-height:1.45;';
            detailsEl.appendChild(pre);

            panel.appendChild(detailsEl);
        }

        // Button row
        const btnRow = document.createElement('div');
        btnRow.style.cssText =
            'display:flex;gap:12px;flex-wrap:wrap;';
        panel.appendChild(btnRow);

        // Try Again button
        const retryBtn = document.createElement('button');
        retryBtn.textContent = 'Try Again';
        retryBtn.style.cssText =
            'flex:1;min-width:120px;padding:12px 20px;border:1px solid rgba(255,122,34,0.7);' +
            'border-radius:11px;cursor:pointer;' +
            'background:linear-gradient(150deg,rgba(255,129,31,0.9),rgba(255,77,109,0.85));' +
            'color:#fff;font-family:inherit;font-size:0.9rem;font-weight:600;' +
            'letter-spacing:0.1em;text-transform:uppercase;' +
            'transition:transform 0.15s ease,border-color 0.15s ease;';
        retryBtn.addEventListener('mouseenter', () => {
            retryBtn.style.transform = 'translateY(-1px)';
            retryBtn.style.borderColor = 'rgba(255,209,102,0.9)';
        });
        retryBtn.addEventListener('mouseleave', () => {
            retryBtn.style.transform = 'translateY(0)';
            retryBtn.style.borderColor = 'rgba(255,122,34,0.7)';
        });
        retryBtn.addEventListener('click', () => {
            window.location.reload();
        });
        btnRow.appendChild(retryBtn);

        // Report Bug link
        const reportBtn = document.createElement('a');
        reportBtn.textContent = 'Report Bug';
        reportBtn.href =
            'https://github.com/emberian/frisqueendom/issues/new?title=' +
            encodeURIComponent(`Bug: ${message.slice(0, 80)}`) +
            '&body=' +
            encodeURIComponent(
                `## Error\n\`\`\`\n${message}\n\`\`\`\n\n## Stack\n\`\`\`\n${details.slice(0, 1000)}\n\`\`\`\n\n## Context\n- URL: ${window.location.href}\n- UA: ${navigator.userAgent}\n`,
            );
        reportBtn.target = '_blank';
        reportBtn.rel = 'noopener noreferrer';
        reportBtn.style.cssText =
            'flex:1;min-width:120px;padding:12px 20px;border:1px solid rgba(255,255,255,0.18);' +
            'border-radius:11px;cursor:pointer;text-decoration:none;text-align:center;' +
            'background:rgba(255,255,255,0.06);' +
            'color:rgba(220,230,245,0.85);font-family:inherit;font-size:0.9rem;font-weight:600;' +
            'letter-spacing:0.1em;text-transform:uppercase;' +
            'transition:transform 0.15s ease,border-color 0.15s ease;';
        reportBtn.addEventListener('mouseenter', () => {
            reportBtn.style.transform = 'translateY(-1px)';
            reportBtn.style.borderColor = 'rgba(143,220,255,0.5)';
        });
        reportBtn.addEventListener('mouseleave', () => {
            reportBtn.style.transform = 'translateY(0)';
            reportBtn.style.borderColor = 'rgba(255,255,255,0.18)';
        });
        btnRow.appendChild(reportBtn);

        this.container.appendChild(this.overlay);
    }

    private dismissOverlay(): void {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
}
