import { loadLists, putList, deleteList, putItem, putItems, deleteItem, requestPersistence } from './db.js';

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
  appVersion: $('#app-version'),
  listPageTpl: $('#list-page-tpl'),
  newListTpl: $('#new-list-tpl'),
  itemTpl: $('#item-tpl'),
  themeLight: $('meta[name="theme-color"][media*="light"]'),
  themeDark: $('meta[name="theme-color"][media*="dark"]'),
};

const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// Pastel hues (OKLCH degrees): blue, mint, pink, butter, lilac, aqua, peach, rose
const HUES = [235, 150, 15, 85, 295, 195, 50, 340];

// ---- State ----

const state = { lists: await load() };
let current = 0; // index of page in view; === state.lists.length means the "new list" page

// Each list carries an `order` so the saved lists come back in the same sequence
async function load() {
  const lists = await loadLists();
  if (!lists.length) {
    // First run: save the starter list
    const list = { id: uid(), name: 'My List', hue: HUES[0], order: 0, items: sampleItems() };
    putList(list);
    putItems(list.id, list.items);
    return [list];
  }
  lists.forEach((list, i) => {
    // Lists saved before colours existed
    if (typeof list.hue !== 'number') {
      list.hue = HUES[i % HUES.length];
      putList(list);
    }
  });
  return lists;
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

const isNewListPage = (i = current) => i >= state.lists.length;
const currentList = () => state.lists[current];

// ---- Rendering ----

// Age label and fade are always filled in; the page's show-age / fade-old classes decide if they show
function itemEl(item) {
  const li = els.itemTpl.content.firstElementChild.cloneNode(true);
  li.dataset.id = item.id;
  $('.item-title', li).textContent = item.title;
  $('.item-comment', li).textContent = item.comment;
  const added = $('.item-age', li);
  if (item.createdAt) {
    const months = ageInMonths(item.createdAt);
    if (months >= 1) li.style.setProperty('--age', months);
    added.dateTime = new Date(item.createdAt).toISOString();
    added.title = `Added ${new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
    added.textContent = timeAgo(item.createdAt);
  } else {
    added.remove();
  }
  return li;
}

function renderItems(listIndex) {
  const ul = $('.items', els.pages.children[listIndex]);
  ul.replaceChildren(...state.lists[listIndex].items.map(itemEl));
}

function applyListSettings(page, list) {
  page.classList.toggle('show-age', !!list.showAge);
  page.classList.toggle('fade-old', !!list.fadeOld);
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
    applyListSettings(page, list);
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
        return dot;
      })
    );
  }
  [...els.dots.children].forEach((dot, i) => dot.setAttribute('aria-selected', i === current));
}

els.dots.addEventListener('click', (e) => {
  const i = [...els.dots.children].indexOf(e.target);
  if (i >= 0) scrollToPage(i);
});

function setTone(el, hue) {
  el.style.setProperty('--hue', hue);
}

function applyHue(hue) {
  setTone(document.documentElement, hue);
  if (els.newListPage) setTone(els.newListPage, hue);
  // Match the header's --surface in each scheme
  els.themeLight.content = `oklch(98.5% 0.012 ${hue})`;
  els.themeDark.content = `oklch(27% 0.03 ${hue})`;
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
// Resize fires in bursts (e.g. while the on-screen keyboard animates); handle once per frame
let resizeQueued = false;
window.addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    els.pages.scrollTo({ left: current * els.pages.clientWidth, behavior: 'instant' });
    // Viewport height changed (rotation, on-screen keyboard), so the cut-off point moves
    els.pages.querySelectorAll('.list-page').forEach(fitBottomGap);
  });
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
  $('.add-btn', els.addForm).setAttribute('aria-label', onNew ? 'Create list' : 'Add item');
}

function createList(name) {
  const order = (state.lists.at(-1)?.order ?? -1) + 1;
  const list = { id: uid(), name, hue: nextHue(), order, items: [] };
  state.lists.push(list);
  putList(list);
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
  const item = { id: uid(), title, comment, createdAt: Date.now() };
  currentList().items.push(item);
  putItem(currentList().id, item);
  const page = els.pages.children[current];
  $('.items', page).append(itemEl(item));
  els.addTitle.value = '';
  els.addComment.value = '';
  els.addTitle.focus();
  fitBottomGap(page);
  page.scrollTo({ top: page.scrollHeight, behavior: 'smooth' });
});

// Unfocus the bar; CSS collapses the comment field once the bar is unfocused and empty
function dismissForm() {
  if (els.addForm.contains(document.activeElement)) document.activeElement.blur();
}

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
  // Second chance: after lifting the finger, press the selected item again to swipe it
  if (selected) {
    if (!swipe && li === selected.li) startSwipe(e.pointerId, e.clientX);
    return;
  }
  if (!li || (e.pointerType === 'mouse' && e.button !== 0)) return;
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
  navigator.vibrate?.(10);
}

function deselect() {
  if (!selected) return;
  const { li } = selected;
  li.classList.remove('selected', 'swiping');
  li.style.transform = '';
  li.style.removeProperty('--swipe');
  selected = null;
  swipe = null;
}

function startSwipe(pointerId, x) {
  swipe = { pointerId, startX: x, lastX: x, lastT: performance.now(), speed: 0 };
}

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
      deleteItem(li.dataset.id);
      deselect();
      const page = li.closest('.page');
      li.remove();
      fitBottomGap(page);
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
  showAppVersion();
}

// The service worker's cache name (CACHE in sw.js) doubles as the app version. Read it from
// sw.js itself so it shows even where no service worker runs (e.g. plain http on a LAN IP).
function showAppVersion() {
  fetch('sw.js')
    .then((res) => res.text())
    .then((src) => {
      els.appVersion.textContent = src.match(/const CACHE = '([^']+)'/)?.[1] ?? '';
    })
    .catch(() => {});
}

els.title.addEventListener('click', openListDialog);
els.menu.addEventListener('click', openListDialog);

$('form', els.listDialog).addEventListener('submit', (e) => {
  if (isNewListPage()) return;
  const name = e.target.name.value.trim();
  if (!name) return;
  const list = currentList();
  Object.assign(list, {
    name,
    showAge: e.target.showAge.checked,
    fadeOld: e.target.fadeOld.checked,
  });
  putList(list);
  els.dots.children[current].setAttribute('aria-label', name);
  renderHeader();
  applyListSettings(els.pages.children[current], list);
});

els.listDialog.addEventListener('click', (e) => {
  const action = e.target.dataset?.action;
  if (action === 'cancel') els.listDialog.close();
  if (action === 'delete') {
    const list = currentList();
    if (state.lists.length > 1 && confirm(`Delete "${list.name}" and all its items?`)) {
      state.lists.splice(current, 1);
      deleteList(list.id);
      current = Math.min(current, state.lists.length - 1);
      els.listDialog.close();
      render();
    }
  }
  if (e.target === els.listDialog) els.listDialog.close();
});

// ---- Boot ----

render();
requestPersistence();
