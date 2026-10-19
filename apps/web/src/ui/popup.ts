/** Close-up view of a clicked emoji: big glyph, Unicode data, links, and the entity's life story. */
import { API, emojiInfo, emojiLinks, type CityAction } from '@xew/shared';
import { api } from '../net.js';
import type { Sprite } from '../layout.js';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class Popup {
  constructor(private root: HTMLElement, private onClose: () => void) {
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }
  get open() { return !this.root.hidden; }
  close() { if (!this.open) return; this.root.hidden = true; this.root.innerHTML = ''; this.onClose(); }

  async show(s: Sprite) {
    const info = emojiInfo(s.g);
    const links = info ? emojiLinks(info) : [];
    this.root.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-label="${esc(info?.name ?? s.g)}">
      <div class="big">${s.g}</div>
      <h2>${esc(s.ref.label)} <small style="opacity:.6">(${s.ref.kind})</small></h2>
      <dl>
        <dt>Name</dt><dd>${esc(info?.name ?? 'unknown')}</dd>
        <dt>Codepoints</dt><dd>${info?.codepoints.join(' ') ?? ''}</dd>
        <dt>Category</dt><dd>${info?.category ?? ''}</dd>
        <dt>Roles</dt><dd>${info?.roles.join(', ') ?? ''}</dd>
        <dt>Emoji version</dt><dd>${info?.version ?? ''}</dd>
        <dt>UTF-8</dt><dd>${[...new TextEncoder().encode(s.g)].map((b) => b.toString(16).padStart(2, '0')).join(' ')}</dd>
        <dt>Entity id</dt><dd>${esc(s.ref.id)}</dd>
      </dl>
      <p class="links">${links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join('')}</p>
      <h3>📖 Life story</h3><ol class="story"><li>Loading…</li></ol>
      <p style="opacity:.5;font-size:12px">Tap outside to return to the city.</p></div>`;
    this.root.hidden = false;
    try {
      const ids = [s.ref.id, s.ref.parentId].filter(Boolean) as string[];
      const lists = await Promise.all(ids.map(async (id) => (await (await fetch(api(API.entityStory(id)))).json()) as CityAction[]));
      const story = lists.flat().sort((a, b) => b.tick - a.tick).slice(0, 40);
      const ol = this.root.querySelector('.story');
      if (ol) ol.innerHTML = story.length ? story.map((a) => `<li>#${a.tick} ${esc(a.text)}</li>`).join('') : '<li>A quiet life so far.</li>';
    } catch { /* offline */ }
  }
}
