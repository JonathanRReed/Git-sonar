/**
 * Small synthesized sounds for the physical controls: the light switch, the
 * dice, the edition stamp. Nothing is downloaded; each sound is a few
 * milliseconds of filtered noise or a falling sine. They only ever play in
 * response to a click, and `localStorage["gallery-sound"] = "off"` silences them.
 */

let context: AudioContext | null = null;

function audio(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
        if (localStorage.getItem('gallery-sound') === 'off') return null;
    } catch {
        // Storage is unavailable in some private modes; the sounds still work.
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
}

/** A burst of band-passed noise: the body of a click or a knock. */
function burst(ac: AudioContext, at: number, frequency: number, seconds: number, gain: number): void {
    const frames = Math.max(1, Math.floor(ac.sampleRate * seconds));
    const buffer = ac.createBuffer(1, frames, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1.4;
    const level = ac.createGain();
    level.gain.value = gain;
    source.connect(filter).connect(level).connect(ac.destination);
    source.start(at);
}

/** A sine that falls in pitch: the weight behind a thud. */
function drop(ac: AudioContext, at: number, from: number, to: number, seconds: number, gain: number): void {
    const osc = ac.createOscillator();
    const level = ac.createGain();
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + seconds);
    level.gain.setValueAtTime(gain, at);
    level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(level).connect(ac.destination);
    osc.start(at);
    osc.stop(at + seconds);
}

/** A rocker switch snapping over. `on` is a touch brighter than off. */
export function playSwitch(on: boolean): void {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    burst(ac, t, on ? 3200 : 2300, 0.035, 0.5);
    drop(ac, t, on ? 220 : 170, 90, 0.05, 0.12);
}

/** Dice landing: a handful of knocks, closer together as they settle. */
export function playDice(): void {
    const ac = audio();
    if (!ac) return;
    let t = ac.currentTime;
    for (let i = 0; i < 5; i++) {
        burst(ac, t, 1500 + Math.random() * 1400, 0.03, 0.34 - i * 0.05);
        t += 0.05 + Math.random() * 0.045 - i * 0.004;
    }
}

/** A rubber stamp coming down on paper. */
export function playStamp(): void {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + 0.02;
    drop(ac, t, 130, 48, 0.2, 0.5);
    burst(ac, t, 700, 0.07, 0.4);
}

/** A light tap, for picking a frame sample up off the counter. */
export function playTap(): void {
    const ac = audio();
    if (!ac) return;
    burst(ac, ac.currentTime, 1900, 0.025, 0.22);
}
