/* Page controller: chrome, contents, the results table, and the WebGL stages. */

import { loadManifest } from './binio.js';
import { createVertebraViewer } from './vertebra.js';
import { createSpineSelector } from './spine.js';
import { createAtlasViewer } from './atlas.js';
import { createLungsViewer } from './lungs.js';
import { createFilmstrip } from './filmstrip.js';

/* --------------------------------------------------------------- theme -- */

function applyTheme(theme) {
  document.body.classList.toggle('night', theme === 'night');
  document.body.classList.toggle('day', theme !== 'night');
  document.documentElement.classList.remove('pre-day', 'pre-night');
  localStorage.setItem('theme', theme);
  window.dispatchEvent(new CustomEvent('themechange'));
}

applyTheme(localStorage.getItem('theme') || 'day');
document.getElementById('theme-btn').addEventListener('click', () => {
  applyTheme(document.body.classList.contains('night') ? 'day' : 'night');
});

/* ------------------------------------------------------------ contents -- */

// Not `.screen` flat: the contents screen is one on a phone and no box at all
// on a wide window, and either way it is the LIST, not an entry in it. Leaving
// it in would have numbered it 01 and pushed every other number one out of step
// with the hero's, which is the one thing this numbering was aligned to avoid.
const screens = [...document.querySelectorAll('.screen:not(.contents-screen)')];
const rail = document.getElementById('rail');
// A plain dot above the numbers: back to the first screen. It is deliberately
// NOT numbered. The hero is not an entry in this list -- neither here nor in
// its own contents list, which does not name the screen you are standing on --
// and giving it an 01 would push every other number one step out of step with
// the hero's, which is the half-match this numbering was aligned to avoid.
const topDot = document.createElement('button');
topDot.className = 'top';
topDot.innerHTML = '<span class="n"></span>'
  + `<span class="t">${screens[0].dataset.title || 'Top'}</span>`;
topDot.setAttribute('aria-label', 'Back to the first screen');
topDot.addEventListener('click', () => screens[0].scrollIntoView({ behavior: 'smooth' }));
rail.appendChild(topDot);

const dots = [];

screens.forEach((section, i) => {
  const title = section.dataset.title || section.id;

  // The hero is not in either list, and for the same reason in both: its own
  // contents list does not name the screen you are standing on, and the rail is
  // hidden while you are standing on it. Skipping it here is also what keeps
  // the two numberings identical -- listing it would have made the rail say
  // "02 Method" against the hero's "01 Method", which is precisely the kind of
  // half-match that costs more than either choice alone.
  if (i === 0) return;

  // The number, not a dot. The hero has just taught the reader this list as
  // "01 Method, 02 The 16 steps"; a rail of identical circles throws that
  // vocabulary away and has to teach a new one, by hover, to someone who does
  // not yet know there is anything to hover over.
  const dot = document.createElement('button');
  dot.innerHTML = `<span class="n">${String(i).padStart(2, '0')}</span>`
    + `<span class="t">${title}</span>`;
  dot.setAttribute('aria-label', title);
  dot.addEventListener('click', () => section.scrollIntoView({ behavior: 'smooth' }));
  rail.appendChild(dot);
  dots.push(dot);
});

// Dot j is screen j + 1: the hero is the plain dot above, not one of these.
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const i = screens.indexOf(e.target);
    dots.forEach((d, j) => d.setAttribute('aria-current', String(j === i - 1)));
    topDot.setAttribute('aria-current', String(i === 0));
    // On the hero the rail is the contents list, spelled out beside the title;
    // everywhere else it is that same list folded back to its numbers. Same
    // element, same place, so the crossing costs no movement.
    rail.dataset.expanded = String(i === 0);
  });
}, { threshold: 0.5 });
screens.forEach((s) => spy.observe(s));

/* ---------------------------------------------------------------- hero -- */

const LOGOS = [
  ['miccai', 'MICCAI 2026'],
  ['inria', 'Inria'],
  ['inserm', 'Inserm'],
  ['myfit', 'MyFit Solutions'],
  ['prairie', 'PRAIRIE Paris School of AI'],
  ['upc', 'Université Paris Cité'],
  ['aphp', 'Assistance Publique – Hôpitaux de Paris'],
];

document.getElementById('logos').innerHTML = LOGOS
  .map(([file, alt]) => `<img src="assets/logos/${file}.png" alt="${alt}" loading="lazy">`)
  .join('');

/* The loop is framed bottom-up: the bottom of the render sits on the bottom of
   the window, and --hero-zoom scales it from there. One fixed zoom cannot serve
   the whole shot, because the subject changes size enormously across it — the
   cloud spans 31 % of the frame width, the isolated column only 7 %, the camera
   pull-back 35 %. At a zoom wide enough to give the pull-back real width, the
   cloud loses half of itself off the top; at a zoom that keeps the cloud whole,
   the pull-back is small.
   So the zoom follows the clock. The keys sit just under a measured ceiling:
   for each instant, the largest zoom that still crops nothing is
   min(1/(1 - y0), (BW/BH)(sh/sw) / subject_width), where y0 is the top of the
   subject in the frame — the first term is the top edge, the second the sides.
   That ceiling is 1.04 while the cloud is on screen, 1.10 over the isolated
   column, and only opens up (2.5, then 3.6) once the camera pull-back has
   pushed the subject down into the bottom of the frame. The curve rises more
   slowly than the ceiling does, which is why the peak can sit at 2.45 even
   though the ceiling two seconds earlier is 1.3.
   Checked by rasterising every quarter-second of the loop at 1280x800,
   1440x900, 1512x860, 1920x1080 and 2560x1440: 100 % of the subject on screen
   throughout, on all five. The first and last key are equal, so the seamless
   loop stays seamless.
   Re-derive these after any change to the Blender framing — they are tuned
   against build_hero_atlas_birth.py's cloud margin, and a looser margin there
   silently leaves the zoom room it no longer needs. */
// Flat 1 throughout, and the machinery is kept only because the next change to
// the shot may need it again. The zoom the flyover needed now lives in the
// CAMERA, in build_hero_atlas_birth.py: the focal length is animated 20 -> 50
// mm across that beat, with a matching shift_y to hold the bottom edge. That
// is the same crop this curve was doing, except the pixels are rendered.
// Measured on a 1512x860 retina screen: done here the peak magnified the
// source 3.1x even from a full 1920x1080 render; done in the camera, 1.0x.
// Nothing on the page is scaled any more, at any point in the loop.
const HERO_ZOOM_KEYS = [
  [0.0, 1.00],
  [15.0, 1.00],
];

function heroZoomAt(t) {
  for (let i = 0; i < HERO_ZOOM_KEYS.length - 1; i += 1) {
    const [t0, z0] = HERO_ZOOM_KEYS[i];
    const [t1, z1] = HERO_ZOOM_KEYS[i + 1];
    if (t >= t0 && t <= t1) {
      const u = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return z0 + (z1 - z0) * u * u * (3 - 2 * u); // smoothstep
    }
  }
  return HERO_ZOOM_KEYS[HERO_ZOOM_KEYS.length - 1][1];
}

/* Where the loop starts, vertically. This has to clear the title block, and
   that block is a PIXEL height — two or three lines of a clamped font plus the
   authors and the affiliation — not a fraction of the window. A constant 10 %
   was right at 768 px tall and put the cloud 44 px over the affiliation line at
   860 px, once the Blender framing was tightened and the subject grew to fill
   95 % of the frame. It is measured instead, off .hero-main rather than off the
   whole grid: the contents list in the left column is taller, but it sits far
   to the side of a centred subject and does not need clearing. */
(function placeHeroTop() {
  const stage = document.getElementById('hero-stage');
  const main = document.querySelector('#hero .hero-main');
  const hero = document.getElementById('hero');
  if (!stage || !main || !hero) return;

  const apply = () => {
    const gap = main.getBoundingClientRect().bottom - hero.getBoundingClientRect().top;
    stage.style.setProperty('--hero-top', `${Math.round(gap + 12)}px`);
  };
  apply();
  new ResizeObserver(apply).observe(main);
  window.addEventListener('resize', apply);
}());

(function driveHeroZoom() {
  const stage = document.getElementById('hero-stage');
  const video = stage?.querySelector('video');
  if (!stage || !video) return;

  // Reduced motion: the loop is already a moving image, and a zoom on top of it
  // is exactly the kind of motion that rule exists to stop. Hold it at 1.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // The mobile fallback puts the loop back in the flow at zoom 1, uncropped.
  const layered = window.matchMedia('(min-width: 821px) and (min-height: 561px)');

  let last = -1;
  (function frame() {
    requestAnimationFrame(frame);
    if (!layered.matches) return;
    const z = heroZoomAt(video.currentTime);
    if (Math.abs(z - last) < 0.002) return;
    last = z;
    stage.style.setProperty('--hero-zoom', z.toFixed(3));
  }());
}());

/* ------------------------------------------------------------- metrics -- */

/* Transcribed from Table 1 of the paper, bold exactly where the paper bolds. */
const METRICS = {
  head: [
    ['Method', ''],
    ['Chamfer', '(mm) &darr;'],
    ['HD95', '(mm) &darr;'],
    ['Log-Jacobian', 'Variance &darr;'],
    ['Training', 'Time &darr;'],
    ['Inference', 'Time &darr;'],
  ],
  rows: [
    ['VoxelMorph', ['2.39 ± 1.20'], ['7.68 ± 4.58'], ['0.12 ± 0.10', true], ['46 min'], ['15.2 ms', true]],
    ['Deformetrica', ['0.24 ± 0.12'], ['0.74 ± 1.61'], ['0.38 ± 0.47'], ['0 s', true], ['43.5 s']],
    ['Ours', ['0.22 ± 0.08', true], ['0.64 ± 0.40', true], ['0.16 ± 0.14'], ['0 s', true], ['1.05 s']],
  ],
};

function buildMetrics() {
  const table = document.getElementById('metrics-table');

  const thead = document.createElement('thead');
  [0, 1].forEach((line) => {
    const tr = document.createElement('tr');
    tr.innerHTML = METRICS.head.map(([a, b]) => `<th>${line === 0 ? a : b}</th>`).join('');
    thead.appendChild(tr);
  });
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  METRICS.rows.forEach(([method, ...cells]) => {
    const tr = document.createElement('tr');
    if (method === 'Ours') tr.className = 'ours';
    tr.innerHTML = `<td>${method}</td>`
      + cells.map(([text, best]) => `<td${best ? ' class="best"' : ''}>${text}</td>`).join('');
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

/* ---------------------------------------------------------------- cite -- */

const BIBTEX = `@inproceedings{bigoballand2026optimal,
  title     = {Optimal Steps for Fast Diffeomorphic Shape Registration},
  author    = {Bigo-Balland, Hadrien and Boeken, Tom and Feydy, Jean},
  booktitle = {Medical Image Computing and Computer Assisted
               Intervention -- MICCAI 2026},
  year      = {2026},
}`;

function buildCite() {
  document.getElementById('bibtex').textContent = BIBTEX;
  const btn = document.getElementById('copy-bibtex');
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(BIBTEX);
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = 'Select it manually';
    }
    setTimeout(() => { btn.textContent = 'Copy BibTeX'; }, 1800);
  });

  fetch('data/refs.json').then((r) => r.json()).then(({ refs }) => {
    document.getElementById('refs').innerHTML = refs.map((r) =>
      `<li><span>${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">${r.text}</a>` : r.text}</span></li>`,
    ).join('');
  }).catch(() => { });
}

/* -------------------------------------------------------------- timeline -- */

function buildTimeline(manifest, viewer) {
  const stripEl = document.getElementById('timeline-ticks');
  const playBtn = document.getElementById('timeline-play');

  /* The kernel halo. Off by default: it is an explanation, not the subject, and
     it repaints the bone in colours that would otherwise be read as anatomy. */
  const kernelBtn = document.getElementById('kernel-toggle');
  const kernelOut = document.getElementById('kernel-radius');
  let kernelOn = false;
  const showRadius = () => {
    kernelOut.textContent = kernelOn ? `r = ${viewer.kernelRadius.toFixed(2)} mm` : '';
  };
  /* The FPFH colouring of video 1, source and target laid side by side. Only
     the real label carries the colours, so the button disables itself on the
     placeholders rather than doing nothing when pressed. */
  const featBtn = document.getElementById('feature-toggle');
  let featOn = false;

  const setKernel = (on) => {
    kernelOn = on;
    viewer.setKernelVisible(on);
    kernelBtn.textContent = on
      ? 'Hide the kernel under the mouse pointer'
      : 'Show the kernel under the mouse pointer';
    kernelBtn.setAttribute('aria-pressed', String(on));
    showRadius();
  };
  const modeBtn = document.getElementById('feature-mode');
  const showMode = () => {
    if (!modeBtn) return;
    modeBtn.hidden = !featOn;
    modeBtn.textContent = featOn ? `by ${viewer.featureMode}` : '';
  };
  const setFeatures = (on) => {
    featOn = on;
    viewer.setFeatureView(on);
    featBtn.textContent = on ? 'Back to the registration' : 'Colour by the features';
    featBtn.setAttribute('aria-pressed', String(on));
    showMode();
  };
  if (modeBtn) {
    // Video 1's own order, and its own argument: coordinates match what is
    // near, FPFH what is shaped alike, and only the two together behave.
    modeBtn.addEventListener('click', () => { viewer.cycleFeatureMode(); showMode(); });
  }

  if (kernelBtn) {
    kernelBtn.addEventListener('click', () => {
      // Mutually exclusive: both repaint the same surface, and read together
      // neither says anything.
      if (!kernelOn && featOn) setFeatures(false);
      setKernel(!kernelOn);
    });
  }
  if (featBtn) {
    featBtn.addEventListener('click', () => {
      if (!featOn && kernelOn) setKernel(false);
      setFeatures(!featOn);
    });
  }

  /** Called when a vertebra finishes loading: the placeholders have no run
   *  behind them and so no features to show. */
  function syncFeatureAvailability() {
    if (!featBtn) return;
    const can = viewer.hasFeatures;
    featBtn.disabled = !can;
    featBtn.title = can ? '' : 'Only the fully registered vertebra carries these';
    if (!can && featOn) setFeatures(false);
  }

  const strip = createFilmstrip({
    container: stripEl,
    manifest,
    viewer,
    onSeek: (step) => viewer.goTo(step),
  });

  /* ----------------------------------------------------------- scrubbing -- */

  let scrubbing = false;
  stripEl.addEventListener('pointerdown', (e) => {
    if (!strip) return;
    scrubbing = true;
    stripEl.setPointerCapture(e.pointerId);
    viewer.goTo(strip.stepAt(e.clientX));
  });
  stripEl.addEventListener('pointermove', (e) => {
    if (scrubbing && strip) viewer.goTo(strip.stepAt(e.clientX));
  });
  const endScrub = (e) => {
    if (!scrubbing) return;
    scrubbing = false;
    try { stripEl.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
  };
  stripEl.addEventListener('pointerup', endScrub);
  stripEl.addEventListener('pointercancel', endScrub);

  stripEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { viewer.goTo(Math.round(viewer.position) + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { viewer.goTo(Math.round(viewer.position) - 1); e.preventDefault(); }
  });

  playBtn.addEventListener('click', () => viewer.togglePlay());

  /* -------------------------------------------------------------- render -- */

  function render(pos) {
    strip?.render(pos);
    showRadius();
    stripEl.setAttribute('aria-valuenow', String(Math.round(pos)));
  }

  function setPlaying(on) {
    playBtn.textContent = on ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play the registration');
  }

  syncFeatureAvailability();
  return { render, setPlaying, strip, onVertebraLoaded: syncFeatureAvailability };
}

/* ----------------------------------------------------------------- boot -- */

async function boot() {
  buildMetrics();
  buildCite();

  let manifest;
  try {
    manifest = await loadManifest();
  } catch {
    document.querySelectorAll('.stage').forEach((s) => {
      s.dataset.failed = 'true';
      s.dataset.failedMessage = 'Could not load the 3D data (data/manifest.json).';
    });
    return;
  }

  window.__miccai = { manifest };

  // The opening loop is now the Blender render in #hero-stage, not the WebGL
  // prototype: createHero() built the same shot live, which was how the shot
  // was designed and timed, but a Cycles render carries the paper's own
  // materials and contours and costs the visitor no GPU. js/hero.js is kept
  // for reference and no longer mounted.

  let timeline;
  const viewer = createVertebraViewer({
    container: document.getElementById('vertebra-stage'),
    manifest,
    ui: {
      onLoaded() { timeline?.strip?.redraw(); timeline?.onVertebraLoaded?.(); },
      onPosition(p) { timeline?.render(p); },
      onPlayState(on) { timeline?.setPlaying(on); },
    },
  });

  if (viewer) {
    window.__miccai.vertebra = viewer;
    timeline = buildTimeline(manifest, viewer);
    window.__miccai.timeline = timeline;

    const byLabel = new Map(manifest.vertebrae.map((v) => [v.label, v]));
    const spine = manifest.atlas && createSpineSelector({
      container: document.getElementById('spine-selector'),
      atlas: manifest.atlas,
      labelEl: document.getElementById('spine-label'),
      onSelect: (label) => { const e = byLabel.get(label); if (e) viewer.load(e); },
    });

    const first = byLabel.get(manifest.realLabel) || manifest.vertebrae[0];
    viewer.load(first);

    if (spine) {
      window.__miccai.spine = spine;
      await spine.load();
      spine.select(first.label);
      window.addEventListener('themechange', () => spine.refreshTheme());
    }
    window.addEventListener('themechange', () => viewer.refreshTheme());
  }

  if (manifest.atlas) {
    const atlas = createAtlasViewer({
      container: document.getElementById('atlas-stage'),
      atlas: manifest.atlas,
      labelEl: document.getElementById('atlas-label'),
    });
    if (atlas) {
      window.__miccai.atlas = atlas;
      atlas.load();
      window.addEventListener('themechange', () => atlas.refreshTheme());
    }
  }

  if (manifest.lungs) {
    const lungs = createLungsViewer({
      container: document.getElementById('lungs-stage'),
      lungs: manifest.lungs,
    });
    if (lungs) {
      window.__miccai.lungs = lungs;
      lungs.load();
      const slider = document.getElementById('lungs-slider');
      slider.addEventListener('input', () => lungs.setBlend(slider.value / 1000));
    }
  }
}

/* ------------------------------------------------- sideways overflow cue -- */

/* Anything that scrolls sideways says so.
 *
 * The results table is quoted from the paper with its columns intact, and the
 * BibTeX is quoted verbatim -- neither can be reflowed without ceasing to be
 * what it is, so on a narrow screen both have to be draggable. The problem is
 * never the dragging, it is that a cut table is indistinguishable from a table
 * that simply ends there, and a phone draws no scrollbar to give the game away.
 *
 * Done here rather than in the sheet because it depends on measurement: only a
 * box that actually overflows gets a cue, and only on the side that has
 * something on it. `scrollWidth - clientWidth - scrollLeft > 1` -- the 1 px is
 * not superstition, fractional layout widths leave a sub-pixel of scroll room
 * on boxes that fit, and without it every table on the page wears a fade.
 */
function markOverflow() {
  document.querySelectorAll('.table-wrap, .bibtex').forEach((box) => {
    const frame = document.createElement('div');
    frame.className = 'table-scroll';
    frame.dataset.touched = 'false';
    box.parentNode.insertBefore(frame, box);
    frame.appendChild(box);

    const hint = document.createElement('span');
    hint.className = 'table-hint';
    hint.textContent = 'drag \u2192';
    frame.appendChild(hint);

    const update = () => {
      const more = [];
      if (box.scrollLeft > 1) more.push('left');
      if (box.scrollWidth - box.clientWidth - box.scrollLeft > 1) more.push('right');
      frame.dataset.more = more.join(' ');
    };

    box.addEventListener('scroll', () => {
      if (box.scrollLeft > 1) frame.dataset.touched = 'true';
      update();
    }, { passive: true });

    // Both boxes, and this is the whole trick. A ResizeObserver on the
    // scrolling box alone never fires after the first layout: the box is
    // block-level, so its own width is settled from the start and never moves
    // again. What changes is what is INSIDE it -- the table reaching its
    // natural width, and then reaching a different one when the paper font
    // finishes loading. Watching only the outer box measured 335 against 335
    // once, concluded the table fitted, and left every cue switched off on a
    // table that was in fact 300 px too wide.
    const ro = new ResizeObserver(update);
    ro.observe(box);
    if (box.firstElementChild) ro.observe(box.firstElementChild);
    if (document.fonts) document.fonts.ready.then(update);
    update();
  });
}
markOverflow();

boot();
