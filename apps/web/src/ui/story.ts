/** The "i" panel: live life-story feed (lockstep with the canvas), stats, search, backups. */
import { API, type CityAction, type CityState } from '@xew/shared';
import { api } from '../net.js';

const MAX_LINES = 400;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class StoryPanel {
  private feed: HTMLUListElement; private stats: HTMLElement; private paused = false;
  constructor(private root: HTMLElement, private onFocus: (id: string) => void) {
    root.innerHTML = `
      <div class="stats"></div>
      <div class="tools">
        <input type="search" placeholder="🔎 search the city's memory…" aria-label="Search actions" />
        <a class="btn" href="${api(API.backupNow)}" download title="Download a full backup of the city database">⬇️ Backup</a>
        <button class="list" title="Scheduled backups">🗂️</button>
      </div>
      <ul class="feed" aria-live="polite"></ul>`;
    this.feed = root.querySelector('.feed')!; this.stats = root.querySelector('.stats')!;
    this.feed.addEventListener('pointerenter', () => (this.paused = true));
    this.feed.addEventListener('pointerleave', () => (this.paused = false));
    this.feed.addEventListener('click', (e) => { const id = (e.target as HTMLElement).closest('li')?.dataset.focus; if (id) onFocus(id); });
    const input = root.querySelector('input')!;
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const res = (await (await fetch(api(API.search + encodeURIComponent(input.value)))).json()) as CityAction[];
      this.feed.innerHTML = ''; res.reverse().forEach((a) => this.push(a, true));
    });
    root.querySelector('.list')!.addEventListener('click', async () => {
      const list = (await (await fetch(api(API.backupList))).json()) as { name: string; bytes: number }[];
      this.feed.innerHTML = list.map((b) => `<li><a href="${api(API.backupFile(b.name))}" download>💾 ${esc(b.name)}</a> <span class="t">${(b.bytes / 1e6).toFixed(1)} MB</span></li>`).join('') || '<li>No scheduled backups yet.</li>';
    });
  }
  set visible(v: boolean) { this.root.hidden = !v; }
  updateStats(s: CityState) {
    const st = s.stats;
    this.stats.innerHTML = `<span>⏱️ tick ${s.tick}</span><span>🧑 ${st.population}</span><span>🏢 ${st.buildings}</span><span>🚪 ${st.apartments}</span><span>📦 ${st.items}</span><span>${s.weather} ${s.districts.length} districts</span>`;
  }
  push(a: CityAction, force = false) {
    if (this.root.hidden && !force) return;
    const li = document.createElement('li');
    const focus = a.path.at(-1) ?? a.actorId; if (focus) li.dataset.focus = focus;
    li.innerHTML = `<span class="t">${new Date(a.at).toLocaleTimeString()} #${a.tick}</span>${esc(a.text)}`;
    this.feed.prepend(li);
    while (this.feed.children.length > MAX_LINES) this.feed.lastElementChild!.remove();
    if (!this.paused) this.feed.scrollTop = 0;
  }
}
