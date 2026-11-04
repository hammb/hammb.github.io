(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };

  /* ---------- theme: light by default, dark only when chosen ---------- */
  const html = document.documentElement;
  const metaTheme = $('meta[name="theme-color"]');
  const syncMeta = () => { if (metaTheme) metaTheme.content = getComputedStyle(html).getPropertyValue('--bg').trim() || '#faf8f4'; };
  const themeBtn = $('.theme-toggle');
  const syncToggle = () => themeBtn.setAttribute('aria-pressed', String(html.dataset.theme === 'dark'));
  syncMeta(); syncToggle();
  themeBtn.addEventListener('click', () => {
    const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
    html.dataset.theme = next;
    store.set('theme', next);
    syncMeta(); syncToggle();
  });

  /* ---------- header ---------- */
  const header = $('.site-header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const menuBtn = $('.menu-toggle'), navList = $('.nav-links');
  menuBtn.addEventListener('click', () => menuBtn.setAttribute('aria-expanded', String(navList.classList.toggle('open'))));
  $$('.nav-links a').forEach((a) => a.addEventListener('click', () => { navList.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }));

  /* scroll-spy: the active section is the last one whose top has passed 35% of the viewport;
     nothing is active while the hero and intro are on screen */
  const links = new Map($$('.nav-links a').map((a) => [a.getAttribute('href').slice(1), a]));
  const secs = [...links.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  let spyRaf = 0;
  const spy = () => {
    spyRaf = 0;
    const line = Math.min(window.innerHeight * 0.35, 320);
    let cur = null;
    for (const sec of secs) if (sec.getBoundingClientRect().top <= line) cur = sec.id;
    if (cur && window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = secs[secs.length - 1].id;
    links.forEach((a, id) => a.classList.toggle('active', id === cur));
  };
  window.addEventListener('scroll', () => { if (!spyRaf) spyRaf = requestAnimationFrame(spy); }, { passive: true });
  window.addEventListener('resize', spy);
  spy();

  /* research table of contents in the rail: mark the station in view */
  const tocLinks = $$('.toc a');
  const stations = tocLinks.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  const research = document.getElementById('research');
  let tocRaf = 0;
  const tocSpy = () => {
    tocRaf = 0;
    const line = window.innerHeight * 0.45;
    let cur = -1;
    stations.forEach((el, i) => { if (el.getBoundingClientRect().top <= line) cur = i; });
    if (research && research.getBoundingClientRect().bottom < line) cur = -1;
    tocLinks.forEach((a, i) => a.classList.toggle('on', i === cur));
  };
  if (tocLinks.length) {
    window.addEventListener('scroll', () => { if (!tocRaf) tocRaf = requestAnimationFrame(tocSpy); }, { passive: true });
    tocSpy();
  }

  /* ---------- toast ---------- */
  const toastEl = $('.toast');
  let toastT = 0;
  const toast = (msg) => { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 1800); };

  /* ---------- publications ---------- */
  const PUBS = window.PUBLICATIONS || [];
  const list = $('#pub-list');
  const TOPICS = [['all', 'all'], ['breast', 'breast MRI'], ['privacy', 'privacy & platforms'], ['seg', 'segmentation']];
  let filter = 'all';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const match = (p, f) => f === 'all' || p.topic === f;
  const url = (p) => p.url || (p.arxiv ? 'https://arxiv.org/abs/' + p.arxiv : 'https://scholar.google.com/scholar?q=' + encodeURIComponent('"' + p.title + '"'));

  function bibtex(p) {
    const last = p.authors.split(',')[0].replace(/\*/g, '').trim().split(' ').pop().replace(/\W/g, '').toLowerCase();
    const word = p.title.split(/[\s:]+/).find((w) => w.length > 3).replace(/\W/g, '').toLowerCase();
    const authors = p.authors.replace(/\*/g, '').replace(/, …,?/g, ', others,').replace(/,\s*…$/, ', others').split(', ').join(' and ');
    const venue = p.venue.replace(/\s*\d{4}$/, '');
    const type = p.kind === 'conf' ? 'inproceedings' : 'article';
    const where = p.kind === 'conf' ? `  booktitle={${venue}}` : p.arxiv && p.kind === 'preprint' ? `  journal={arXiv preprint arXiv:${p.arxiv}}` : `  journal={${venue}}`;
    return `@${type}{${last}${p.year}${word},\n  title={${p.title}},\n  author={${authors}},\n${where},\n  year={${p.year}}\n}`;
  }

  const pubHTML = (p, i) => `<article class="pub${p.first ? ' first' : ' co'}${p.compact ? ' compact' : ''}"${p.id ? ` id="p-${esc(p.id)}"` : ''}>
        <h3><a href="${esc(url(p))}" target="_blank" rel="noopener">${esc(p.title)}</a></h3>
        <div>
          <div class="authors">${esc(p.authors).replace(/(B\. Hamm\*?)/, '<span class="me">$1</span>')}</div>
          <div class="meta"><span>${esc(p.venue)}</span>${(p.badges || []).map((b) => `<span class="badge">${esc(b)}</span>`).join('')}</div>
        </div>
        <div class="plinks">
          <a href="${esc(url(p))}" target="_blank" rel="noopener">paper</a>
          ${p.code ? `<a href="${esc(p.code)}" target="_blank" rel="noopener">code</a>` : ''}
          <button type="button" data-bib="${i}">bibtex</button>
        </div>
      </article>`;

  /* every paper is shown: first-author (incl. shared first) group, then co-authored by year */
  function render() {
    const items = PUBS.map((p, i) => [p, i]).filter(([p]) => match(p, filter)).sort((a, b) => b[0].year - a[0].year);
    const own = items.filter(([p]) => p.first), co = items.filter(([p]) => !p.first);
    let out = '';
    if (own.length) {
      out += `<h3 class="group-h">First author<span class="n">${own.length}</span></h3>`;
      out += own.map(([p, i]) => pubHTML(p, i)).join('');
    }
    if (co.length) {
      out += `<h3 class="group-h co-h">Co-author<span class="n">${co.length}</span></h3>`;
      let year = null;
      for (const [p, i] of co) {
        if (p.year !== year) {
          year = p.year;
          const all = co.filter(([q]) => q.year === year);
          const note = all.every(([q]) => q.compact) ? '<span class="y-note">challenge entries</span>' : '';
          out += `<div class="year">${year}${note}</div>`;
        }
        out += pubHTML(p, i);
      }
    }
    list.innerHTML = out || '<p class="pub-note">Nothing here yet.</p>';
  }
  const bar = $('#pub-filters');
  bar.innerHTML = '<span class="lbl">show</span>' + TOPICS.map(([k, label]) => `<button type="button" data-f="${k}" aria-pressed="${k === filter}">${label}<span class="n">${PUBS.filter((p) => match(p, k)).length}</span></button>`).join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    $$('button', bar).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  });
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bib]');
    if (!b) return;
    const text = bibtex(PUBS[+b.dataset.bib]);
    try { await navigator.clipboard.writeText(text); toast('BibTeX copied'); } catch (err) { window.prompt('Copy BibTeX:', text); }
  });
  render();

  /* links from Research to a paper: show all if the filter hides it, then scroll */
  const showPub = () => {
    const m = location.hash.match(/^#p-[\w-]+$/);
    if (!m) return;
    const id = m[0].slice(1);
    if (!document.getElementById(id) && filter !== 'all') {
      filter = 'all';
      $$('button', bar).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.f === 'all')));
      render();
    }
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: 'center' });
  };
  window.addEventListener('hashchange', showPub);
  if (/^#p-/.test(location.hash)) showPub();

  /* ---------- email (assembled at runtime) ---------- */
  const mail = ['benjamin.hamm', 'dkfz-heidelberg.de'].join('@');
  $$('[data-mail]').forEach((a) => { a.href = 'mailto:' + mail; });
  $$('[data-mail-text]').forEach((a) => { a.textContent = mail; });
  $$('[data-copy-mail]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(mail); toast('Email copied'); } catch (e) { window.location.href = 'mailto:' + mail; }
  }));
  const yr = $('#year');
  if (yr) yr.textContent = new Date().getFullYear();
})();
