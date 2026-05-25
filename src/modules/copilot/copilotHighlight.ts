/**
 * Triggers a glow/pulse highlight on the copilot scroll target after navigation.
 * Adds a CSS class that runs the animation, then removes it automatically.
 */

const HIGHLIGHT_CLASS = 'copilot-highlight';
const HIGHLIGHT_DURATION_MS = 2800;

export function triggerCopilotHighlight(elementId = 'copilot-scroll-target'): void {
  requestAnimationFrame(() => {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Force reflow so re-triggering the animation works
    el.classList.remove(HIGHLIGHT_CLASS);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(HIGHLIGHT_CLASS);

    window.setTimeout(() => {
      el.classList.remove(HIGHLIGHT_CLASS);
    }, HIGHLIGHT_DURATION_MS);
  });
}
