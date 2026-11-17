/**
 * Gallery lighting, shared by every page.
 *
 * The light switch: off dims the room to its picture lights ("after hours").
 * The setting is restored before first paint by the inline script in SiteHead.
 *
 * The key light: it follows the pointer, so frames throw their shadows away
 * from it and their glass catches a moving reflection (see --lx / --ly).
 */
const root = document.documentElement;
const switches = document.querySelectorAll<HTMLButtonElement>('[data-light-switch]');

function sync(): void {
    const on = root.dataset.lights !== 'off';
    for (const button of switches) button.setAttribute('aria-pressed', String(on));
}

sync();

for (const button of switches) {
    button.addEventListener('click', () => {
        const off = root.dataset.lights !== 'off';
        if (off) root.dataset.lights = 'off';
        else delete root.dataset.lights;
        try {
            localStorage.setItem('gallery-lights', off ? 'off' : 'on');
        } catch {
            // Private mode: the switch still works for this visit.
        }
        sync();
    });
}

if (window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
    let frame = 0;
    window.addEventListener(
        'pointermove',
        (event) => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                root.style.setProperty('--lx', ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3));
                root.style.setProperty('--ly', ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3));
            });
        },
        { passive: true }
    );
}

export {};
