const STORAGE_KEY = 'thelist:v1';

const $ = (sel, root = document) => root.querySelector(sel);

const els = {
  pages: $('#pages'),
  title: $('#list-title'),
  dots: $('#dots'),
  prev: $('#prev-btn'),
  next: $('#next-btn'),
  menu: $('#menu-btn'),
  addForm: $('#add-form'),
  addTitle: $('#add-title'),
  addComment: $('#add-comment'),
  selectScrim: $('#select-scrim'),
  listDialog: $('#list-dialog'),
  listPageTpl: $('#list-page-tpl'),
  newListTpl: $('#new-list-tpl'),
};

const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// Pastel hues (OKLCH degrees): blue, mint, pink, butter, lilac, aqua, peach, rose
const HUES = [235, 150, 15, 85, 295, 195, 50, 340];

// ---- State ----

let state = load();
let current = 0; // index of page in view; === state.lists.length means the "new list" page

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.lists) && data.lists.length) {
      data.lists.forEach((list, i) => {
        if (typeof list.hue !== 'number') list.hue = HUES[i % HUES.length];
      });
      return data;
    }
  } catch {}
  return { lists: [{ id: uid(), name: 'My List', hue: HUES[0], items: sampleItems() }] };
}

// TEST DATA: 30 items spread from 2 years ago to today, to preview age fading.
// Remove this function (and its call above) to start with an empty list.
function sampleItems() {
  const titles = [
    'Renew passport', 'Fix the bike light', 'Call the dentist', 'Buy picture hooks', 'Sort old photos',
    'Return library books', 'Clean the gutters', 'Order new glasses', 'Try the ramen place', 'Back up laptop',
    'Plant tulip bulbs', 'Frame the poster', 'Learn to make bread', 'Service the boiler', 'Donate old clothes',
    'Replace smoke alarm battery', 'Book a haircut', 'Read "Dune"', 'Write thank-you cards', 'Descale the kettle',
    'Pay the water bill', 'Buy birthday gift', 'Check tyre pressure', 'Water the plants', 'Pick up dry cleaning',
    'Email the landlord', 'Charge the camera', 'Buy oat milk', 'Take out recycling', 'Call Mum',
  ];
  const DAY = 86400000;
  return titles.map((title, i) => {
    const days = Math.round(((titles.length - 1 - i) / (titles.length - 1)) * 730); // oldest first
    const comment = i % 4 === 0 ? ['Before the trip', 'The one on the high street', 'Ask about weekends', 'Check the receipt first'][(i / 4) % 4] : '';
    return { id: uid(), title, comment, createdAt: Date.now() - days * DAY };
  });
}

// Prefer a hue no list is using yet; once all are taken, keep cycling
function nextHue() {
  const used = new Set(state.lists.map((l) => l.hue));
  return HUES.find((h) => !used.has(h)) ?? HUES[state.lists.length % HUES.length];
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const isNewListPage = (i = current) => i >= state.lists.length;
const currentList = () => state.lists[current];

// ---- Rendering ----

function renderItems(listIndex) {
  const page = els.pages.children[listIndex];
  const ul = $('.items', page);
  const list = state.lists[listIndex];
  ul.replaceChildren(
    ...list.items.map((item) => {
      const li = document.createElement('li');
      li.className = 'item';
      li.dataset.id = item.id;
      if (list.fadeOld) {
        const months = ageInMonths(item.createdAt);
        if (months >= 1) li.style.setProperty('--age', months);
      }

      const title = document.createElement('span');
      title.className = 'item-title';
      title.textContent = item.title;
      li.append(title);

      if (list.showAge && item.createdAt) {
        const added = document.createElement('time');
        added.className = 'item-age';
        added.dateTime = new Date(item.createdAt).toISOString();
        added.title = `Added ${new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
        added.textContent = timeAgo(item.createdAt);
        li.append(added);
      }

      if (item.comment) {
        const comment = document.createElement('span');
        comment.className = 'item-comment';
        comment.textContent = item.comment;
        li.append(comment);
      }

      return li;
    })
  );
  fitBottomGap(page);
}

// Bottom gap below the latest item: at least MIN_GAP, plus whatever it takes for the topmost
// visible item to be partly cut off when scrolled to the bottom, hinting there's more above.
const MIN_GAP = 200;
const TOP_ITEM_VISIBLE = 0.6; // fraction of the cut-off top item left showing

function fitBottomGap(page) {
  const items = page.querySelectorAll('.item');
  page.style.paddingBottom = '';
  if (!items.length) return;
  const pageTop = page.getBoundingClientRect().top - page.scrollTop;
  const pos = (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top - pageTop, height: r.height };
  };
  const last = pos(items[items.length - 1]);
  const contentEnd = last.top + last.height;
  const view = page.clientHeight;
  const minTop = contentEnd + MIN_GAP - view; // where the view's top edge sits with only the minimum gap
  if (minTop <= 0) return; // doesn't scroll, nothing hidden above
  for (const el of items) {
    const { top, height } = pos(el);
    const cut = top + height * (1 - TOP_ITEM_VISIBLE); // view top that leaves this item partly showing
    if (cut >= minTop) {
      page.style.paddingBottom = `${cut - contentEnd + view}px`;
      return;
    }
  }
}

// "today", "yesterday", "3 days ago", "2 weeks ago", "5 months ago", "1 year ago"
const relTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function timeAgo(createdAt) {
  const days = Math.floor((Date.now() - createdAt) / 86400000);
  if (days < 7) return relTime.format(-days, 'day');
  if (days < 30) return relTime.format(-Math.floor(days / 7), 'week');
  if (days < 365) return relTime.format(-Math.floor(days / 30.44), 'month');
  return relTime.format(-Math.floor(days / 365.25), 'year');
}

// Whole months since an item was added (0 if unknown); drives the fade in styles.css
function ageInMonths(createdAt) {
  return createdAt ? Math.floor((Date.now() - createdAt) / (30.44 * 86400000)) : 0;
}

function renderPages() {
  const pages = state.lists.map((list) => {
    const page = els.listPageTpl.content.firstElementChild.cloneNode(true);
    page.dataset.id = list.id;
    setTone(page, list.hue);
    return page;
  });
  els.newListPage = els.newListTpl.content.firstElementChild.cloneNode(true);
  pages.push(els.newListPage);
  els.pages.replaceChildren(...pages);
  offscreenReset.disconnect();
  pages.slice(0, -1).forEach((page) => offscreenReset.observe(page));
  state.lists.forEach((_, i) => renderItems(i));
}

function renderHeader() {
  const onNew = isNewListPage();
  applyHue(onNew ? nextHue() : currentList().hue);
  els.title.textContent = onNew ? 'New list' : currentList().name;
  els.title.disabled = onNew;
  els.menu.disabled = onNew;
  els.prev.disabled = current === 0;
  els.next.disabled = onNew;
  setFormMode(onNew);

  const total = state.lists.length + 1;
  if (els.dots.children.length !== total) {
    els.dots.replaceChildren(
      ...Array.from({ length: total }, (_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = i === total - 1 ? 'dot plus' : 'dot';
        if (i === total - 1) dot.textContent = '+';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', i === total - 1 ? 'New list' : state.lists[i].name);
        dot.addEventListener('click', () => scrollToPage(i));
        return dot;
      })
    );
  }
  [...els.dots.children].forEach((dot, i) => {
    dot.classList.toggle('active', i === current);
    dot.setAttribute('aria-selected', i === current);
  });
}

function setTone(el, hue) {
  el.style.setProperty('--hue', hue);
}

function applyHue(hue) {
  setTone(document.documentElement, hue);
  if (els.newListPage) setTone(els.newListPage, hue);
  // Match the header's --surface in each scheme
  document.querySelector('meta[name="theme-color"][media*="light"]').content = `oklch(98.5% 0.012 ${hue})`;
  document.querySelector('meta[name="theme-color"][media*="dark"]').content = `oklch(27% 0.03 ${hue})`;
}

// Show the latest item: lists open scrolled to the bottom
function scrollToLatest(page) {
  page.scrollTop = page.scrollHeight;
}

// Reset a list as soon as it's fully out of view, so switching to it always lands on its latest item
const offscreenReset = new IntersectionObserver(
  (entries) => entries.forEach((e) => !e.isIntersecting && scrollToLatest(e.target)),
  // Shrink the root 1px each side: a neighbouring page only touches the edge, which would count as intersecting
  { root: els.pages, rootMargin: '0px -1px' }
);

function render() {
  renderPages();
  current = Math.min(current, state.lists.length);
  scrollToPage(current, false);
  renderHeader();
  // After the header is filled in, so page heights are final
  [...els.pages.children].forEach((page) => {
    if (page.classList.contains('list-page')) fitBottomGap(page);
    scrollToLatest(page);
  });
}

// ---- Navigation ----

function scrollToPage(i, smooth = true) {
  i = Math.max(0, Math.min(i, state.lists.length));
  els.pages.scrollTo({ left: i * els.pages.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
  if (!smooth) setCurrent(i);
}

function setCurrent(i) {
  if (i === current) return;
  current = i;
  renderHeader();
}

els.pages.addEventListener(
  'scroll',
  () => {
    const w = els.pages.clientWidth;
    if (!w) return;
    // Mid-swipe (between pages, so not a programmatic jump like after creating a list): leave the form
    if (Math.abs(els.pages.scrollLeft - current * w) > 1) dismissForm();
    setCurrent(Math.round(els.pages.scrollLeft / w));
  },
  { passive: true }
);

// Keep the current page aligned when the viewport resizes (rotation, etc.)
window.addEventListener('resize', () => {
  els.pages.scrollTo({ left: current * els.pages.clientWidth, behavior: 'instant' });
  // Viewport height changed (rotation, on-screen keyboard), so the cut-off point moves
  [...els.pages.querySelectorAll('.list-page')].forEach(fitBottomGap);
});

els.prev.addEventListener('click', () => scrollToPage(current - 1));
els.next.addEventListener('click', () => scrollToPage(current + 1));

els.pages.addEventListener('keydown', (e) => {
  if (e.target !== els.pages) return;
  if (e.key === 'ArrowLeft') scrollToPage(current - 1);
  if (e.key === 'ArrowRight') scrollToPage(current + 1);
});

// ---- Bottom bar: adds an item, or names a new list on the "+ New list" page ----

// Separate drafts so a half-typed item doesn't become a list name (and vice versa)
const drafts = { item: '', list: '' };
let newListMode = false;

function setFormMode(onNew) {
  if (onNew === newListMode) return;
  drafts[newListMode ? 'list' : 'item'] = els.addTitle.value;
  newListMode = onNew;
  els.addTitle.value = drafts[onNew ? 'list' : 'item'];
  els.addForm.classList.toggle('new-list-mode', onNew);
  els.addTitle.placeholder = onNew ? 'New list name…' : 'Add an item…';
  els.addTitle.setAttribute('aria-label', onNew ? 'New list name' : 'Item title');
  els.addComment.tabIndex = onNew ? -1 : 0;
  $('.add-btn', els.addForm).setAttribute('aria-label', onNew ? 'Create list' : 'Add item');
}

function createList(name) {
  state.lists.push({ id: uid(), name, hue: nextHue(), items: [] });
  save();
  els.addTitle.value = '';
  current = state.lists.length - 1;
  render();
  els.addTitle.focus();
}

els.addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = els.addTitle.value.trim();
  if (!title) return;
  if (isNewListPage()) return createList(title);
  const comment = els.addComment.value.trim();
  const list = currentList();
  list.items.push({ id: uid(), title, comment, createdAt: Date.now() });
  save();
  renderItems(current);
  els.addTitle.value = '';
  els.addComment.value = '';
  els.addTitle.focus();
  const page = els.pages.children[current];
  page.scrollTo({ top: page.scrollHeight, behavior: 'smooth' });
});

// Reveal the comment field while the form is in use
// (Not when naming a new list: there's no comment field to show)
els.addForm.addEventListener('focusin', () => !newListMode && els.addForm.classList.add('expanded'));
// Unfocus the bar and collapse the comment field (unless a comment has been typed)
function dismissForm() {
  if (!els.addForm.contains(document.activeElement)) return;
  document.activeElement.blur();
  if (!els.addComment.value) els.addForm.classList.remove('expanded');
}

els.addForm.addEventListener('focusout', () => {
  setTimeout(() => {
    if (!els.addForm.contains(document.activeElement) && !els.addTitle.value && !els.addComment.value) {
      els.addForm.classList.remove('expanded');
    }
  });
});

// ---- Delete item (press and hold to select, then swipe it away) ----

const HOLD_MS = 400;
const MOVE_TOLERANCE = 8; // px of movement allowed before the hold counts as a scroll
const SWIPE_DELETE_RATIO = 0.35; // fraction of the item's width that commits a delete
const FLICK_SPEED = 0.6; // px/ms; a fast flick deletes even when short

let hold = null; // pending press: { li, pointerId, x, y, timer }
let selected = null; // { li, listIndex }
let swipe = null; // active swipe on the selected item: { pointerId, startX, lastX, lastT, speed }

els.pages.addEventListener('pointerdown', (e) => {
  const li = e.target.closest('.item');
  if (!li || selected || (e.pointerType === 'mouse' && e.button !== 0)) return;
  hold = {
    li,
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    timer: setTimeout(() => {
      const { li, pointerId, x } = hold;
      cancelHold();
      select(li);
      startSwipe(pointerId, x); // the finger is still down, so it can swipe straight away
    }, HOLD_MS),
  };
  li.classList.add('pressing');
});

function cancelHold() {
  if (!hold) return;
  clearTimeout(hold.timer);
  hold.li.classList.remove('pressing');
  hold = null;
}

function select(li) {
  selected = { li, listIndex: [...els.pages.children].indexOf(li.closest('.page')) };
  li.classList.add('selected');
  els.selectScrim.hidden = false;
  navigator.vibrate?.(10);
}

function deselect() {
  if (!selected) return;
  const { li } = selected;
  li.classList.remove('selected', 'swiping');
  li.style.transform = '';
  li.style.removeProperty('--swipe');
  els.selectScrim.hidden = true;
  selected = null;
  swipe = null;
}

function startSwipe(pointerId, x) {
  swipe = { pointerId, startX: x, lastX: x, lastT: performance.now(), speed: 0 };
}

// Second chance: after lifting the finger, press the selected item again to swipe it
els.pages.addEventListener('pointerdown', (e) => {
  if (selected && !swipe && e.target.closest('.item') === selected.li) startSwipe(e.pointerId, e.clientX);
});

// Tapping anywhere outside the selected item cancels
els.selectScrim.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  deselect();
});

window.addEventListener('pointermove', (e) => {
  if (hold && e.pointerId === hold.pointerId) {
    if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > MOVE_TOLERANCE) cancelHold();
    return;
  }
  if (!swipe || e.pointerId !== swipe.pointerId) return;
  const now = performance.now();
  swipe.speed = (e.clientX - swipe.lastX) / Math.max(1, now - swipe.lastT);
  swipe.lastX = e.clientX;
  swipe.lastT = now;
  const dx = e.clientX - swipe.startX;
  const { li } = selected;
  li.classList.add('swiping');
  li.style.transform = `translateX(${dx}px)`;
  li.style.setProperty('--swipe', Math.min(1, Math.abs(dx) / (li.offsetWidth * SWIPE_DELETE_RATIO)));
});

// While an item is selected, stop the browser from scrolling or swiping pages under the finger
window.addEventListener('touchmove', (e) => selected && e.preventDefault(), { passive: false });
// Suppress the long-press context menu / callout on items
els.pages.addEventListener('contextmenu', (e) => e.target.closest('.item') && e.preventDefault());

function endSwipe(e) {
  if (hold && e.pointerId === hold.pointerId) cancelHold();
  if (!swipe || e.pointerId !== swipe.pointerId) return;
  const { li, listIndex } = selected;
  const dx = swipe.lastX - swipe.startX;
  const flicked = Math.abs(swipe.speed) > FLICK_SPEED && Math.sign(swipe.speed) === Math.sign(dx);
  swipe = null;
  li.classList.remove('swiping');

  if (e.type !== 'pointercancel' && (Math.abs(dx) > li.offsetWidth * SWIPE_DELETE_RATIO || flicked)) {
    // Slide it the rest of the way out, then delete
    li.style.transform = `translateX(${Math.sign(dx) * window.innerWidth}px)`;
    li.classList.add('removing');
    setTimeout(() => {
      const list = state.lists[listIndex];
      list.items = list.items.filter((it) => it.id !== li.dataset.id);
      save();
      deselect();
      renderItems(listIndex);
    }, 200);
  } else {
    // Not far enough: spring back and stay selected
    li.style.transform = '';
    li.style.removeProperty('--swipe');
  }
}

window.addEventListener('pointerup', endSwipe);
window.addEventListener('pointercancel', endSwipe);

// ---- Rename / delete list ----

function openListDialog() {
  if (isNewListPage()) return;
  const form = $('form', els.listDialog);
  form.name.value = currentList().name;
  form.showAge.checked = !!currentList().showAge;
  form.fadeOld.checked = !!currentList().fadeOld;
  $('[data-action="delete"]', els.listDialog).disabled = state.lists.length <= 1;
  els.listDialog.returnValue = '';
  els.listDialog.showModal();
}

els.title.addEventListener('click', openListDialog);
els.menu.addEventListener('click', openListDialog);

$('form', els.listDialog).addEventListener('submit', (e) => {
  if (isNewListPage()) return;
  const name = e.target.name.value.trim();
  if (!name) return;
  Object.assign(currentList(), {
    name,
    showAge: e.target.showAge.checked,
    fadeOld: e.target.fadeOld.checked,
  });
  save();
  els.dots.replaceChildren(); // force aria labels to refresh
  renderHeader();
  renderItems(current);
});

els.listDialog.addEventListener('click', (e) => {
  const action = e.target.dataset?.action;
  if (action === 'cancel') els.listDialog.close();
  if (action === 'delete') {
    const list = currentList();
    if (state.lists.length > 1 && confirm(`Delete "${list.name}" and all its items?`)) {
      state.lists.splice(current, 1);
      current = Math.min(current, state.lists.length - 1);
      save();
      els.listDialog.close();
      render();
    }
  }
  if (e.target === els.listDialog) els.listDialog.close();
});

// ---- Boot ----

save(); // persist any hues assigned to lists saved before colours existed
render();
