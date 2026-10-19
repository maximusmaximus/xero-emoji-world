/**
 * Xero Emoji World — web client entry.
 * Full-viewport canvas + one "i" button. State arrives as a snapshot then a stream of
 * actions whose patches are applied with the SAME reducer as the server (lockstep).
 */
import './styles.css';
import { applyAction, indexCity, type CityIndex, type CityState } from '@xew/shared';
import { computeLayout } from './layout.js';
import { installMobileGuards, scheduleFullscreen } from './mobile.js';
import { connect } from './net.js';
import { Renderer } from './renderer.js';
import { Popup } from './ui/popup.js';
import { StoryPanel } from './ui/story.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const scroller = $('scroller'), canvas = $<HTMLCanvasElement>('city'), btn = $<HTMLButtonElement>('info-btn');
const renderer = new Renderer(canvas, scroller, $('world-size'));

let state: CityState | undefined; let idx: CityIndex | undefined;
let infoOn = false; let dirty = false; let first = true;

const story = new StoryPanel($('story'), (id) => { renderer.highlightId = id; renderer.centerOn(id); });
const popup = new Popup($('popup'), () => { renderer.highlightId = undefined; });

btn.addEventListener('click', () => {
  infoOn = !infoOn; btn.setAttribute('aria-pressed', String(infoOn)); story.visible = infoOn;
  if (state) story.updateStats(state);
  if (!infoOn) popup.close();
});

connect({
  onSnapshot(s) {
    state = s; idx = indexCity(s); dirty = true;
    if (first) { first = false; requestAnimationFrame(() => scroller.scrollTo({ left: 0, top: Math.max(0, scroller.scrollHeight / 2 - innerHeight) })); }
  },
  onAction(a) {
    if (!state || !idx) return;
    applyAction(state, idx, a); dirty = true;
    story.push(a);
  },
  onTick() { if (state && infoOn) story.updateStats(state); },
  onStatus(s) { btn.style.opacity = s === 'live' ? '1' : '.5'; },
});

// Click-to-inspect only while "i" is on.
let down: { x: number; y: number } | undefined;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (!infoOn || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const s = renderer.hit(e.clientX, e.clientY, performance.now() / 1000);
  if (s) { renderer.highlightId = s.ref.id; void popup.show(s); }
});

// Mouse drag-to-pan on desktop (touch uses native scrolling).
let drag: { x: number; y: number; l: number; t: number } | undefined;
scroller.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, l: scroller.scrollLeft, t: scroller.scrollTop }; scroller.classList.add('dragging'); });
addEventListener('mousemove', (e) => { if (drag) scroller.scrollTo(drag.l - (e.clientX - drag.x), drag.t - (e.clientY - drag.y)); });
addEventListener('mouseup', () => { drag = undefined; scroller.classList.remove('dragging'); });

installMobileGuards();
scheduleFullscreen();

// Relayout at most a few times per second; animate every frame.
let lastLayout = 0;
const loop = (ms: number) => {
  if (state && dirty && ms - lastLayout > 250) { renderer.setLayout(computeLayout(state)); dirty = false; lastLayout = ms; }
  renderer.frame(ms / 1000);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
