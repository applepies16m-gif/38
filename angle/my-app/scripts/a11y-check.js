// Checks every component template against the accessibility rules
// that can be tested from markup alone, and the stylesheet colours
// against the 4.5 to 1 contrast standard.
//   npm run check:a11y     (or: node scripts/a11y-check.js [path to src])
const fs = require('fs');
const path = require('path');
const src = process.argv[2] || path.join(__dirname, '..', 'src');
const ATTRS = '((?:[^<>"\']|"[^"]*"|\'[^\']*\')*)';
let problems = 0;
const report = (file, text) => { problems++; console.log('  PROBLEM ' + file + ': ' + text); };
const counts = { templates: 0, controls: 0, buttons: 0, images: 0, headings: 0 };

const componentsDir = path.join(src, 'app', 'components');
for (const dir of fs.readdirSync(componentsDir)) {
  const file = path.join(componentsDir, dir, dir + '.component.html');
  if (!fs.existsSync(file)) continue;
  counts.templates++;
  const html = fs.readFileSync(file, 'utf8');
  const labelFors = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map(m => m[1]));
  // Text inside <label>...</label> pairs, to spot controls wrapped by their label.
  const wrapped = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].map(m => m[1]).join('\n');

  // Rule 1: nothing clickable that the keyboard can't reach.
  for (const m of html.matchAll(new RegExp('<(a|div|span|td|tr|li|p|img)\\b' + ATTRS + '>', 'g'))) {
    const [, tag, attrs] = m;
    if (!attrs.includes('(click)')) continue;
    if (tag === 'a' && /routerLink|href=/.test(attrs)) continue;
    if (/tabindex=/.test(attrs) && /\(keydown|\(keyup/.test(attrs)) continue;
    report(dir, 'a <' + tag + '> has a click handler but is not a button or a real link: ' + attrs.trim().slice(0, 70));
  }
  // Rule 2: every form control has a name a screen reader can read.
  for (const m of html.matchAll(new RegExp('<(input|textarea|select)\\b' + ATTRS + '/?>', 'g'))) {
    const [whole, tag, attrs] = m;
    if (/type="hidden"/.test(attrs)) continue;
    counts.controls++;
    const id = (/\sid="([^"]+)"/.exec(attrs) || [])[1];
    const named = /aria-label=/.test(attrs) || (id && labelFors.has(id)) || wrapped.includes(whole);
    if (!named) report(dir, 'a <' + tag + '> has no label: ' + attrs.trim().slice(0, 70));
  }
  // Rule 3: every label that points at something points at a real control.
  for (const id of labelFors) {
    if (!new RegExp('\\sid="' + id + '"').test(html)) report(dir, 'a label points at a missing id: ' + id);
  }
  // Rule 4: ids are unique within a page.
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  for (const id of new Set(ids)) if (ids.filter(x => x === id).length > 1) report(dir, 'the id "' + id + '" is used more than once');
  // Rule 5: every image has alternative text.
  for (const m of html.matchAll(new RegExp('<img\\b' + ATTRS + '/?>', 'g'))) {
    counts.images++;
    if (!/\salt=|\[alt\]=|\[attr\.alt\]=/.test(m[1])) report(dir, 'an image has no alt text: ' + m[1].trim().slice(0, 60));
  }
  // Rule 6: every button has a type, so none submits a form by accident.
  for (const m of html.matchAll(new RegExp('<button\\b' + ATTRS + '>', 'g'))) {
    counts.buttons++;
    if (!/\stype=/.test(m[1])) report(dir, 'a button has no type: ' + m[1].trim().slice(0, 60));
  }
  // Rule 7: panel titles are marked as headings.
  for (const m of html.matchAll(new RegExp('<div\\b' + ATTRS + '>', 'g'))) {
    if (!/class="[^"]*\bpanel-header\b/.test(m[1])) continue;
    counts.headings++;
    if (!/role="heading"/.test(m[1])) report(dir, 'a panel title is not marked as a heading');
  }
  // Rule 8: each page marks its main area.
  if (!/role="main"/.test(html)) report(dir, 'no main content area is marked');
}
console.log('templates:', counts.templates, '| form controls:', counts.controls, '| buttons:', counts.buttons, '| images:', counts.images, '| panel headings:', counts.headings);

// --- Contrast of the colour pairs the site uses for text ---
const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const styles = fs.readFileSync(path.join(src, 'styles.css'), 'utf8');
const variable = name => (new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})').exec(styles) || [])[1];
const rule = selector => (new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*?(?:background|color):\\s*(#[0-9a-fA-F]{3,6})').exec(styles) || [])[1];
const pairs = [
  ['body text on white', variable('text-dark'), '#ffffff'],
  ['muted text on white', variable('text-muted'), '#ffffff'],
  ['muted text on the page background', variable('text-muted'), variable('page-bg')],
  ['muted text on the composer strip', variable('text-muted'), '#f7f9fc'],
  ['panel title on its header', variable('chrome-blue-dark'), '#e8edf5'],
  ['link-style button on white', variable('chrome-blue'), '#ffffff'],
  ['white on the top bar (lightest shade)', '#ffffff', variable('chrome-blue-light')],
  ['white on primary button (lightest shade)', '#ffffff', variable('chrome-blue-lighter')],
  ['white on the admin badge', '#ffffff', rule('.badge-admin')],
  ['white on the online badge', '#ffffff', rule('.badge-online')],
  ['white on the offline badge', '#ffffff', rule('.badge-offline')],
];
// Text colours set in component stylesheets, checked on white.
for (const dir of fs.readdirSync(componentsDir)) {
  const cssFile = path.join(componentsDir, dir, dir + '.component.css');
  if (!fs.existsSync(cssFile)) continue;
  for (const m of fs.readFileSync(cssFile, 'utf8').matchAll(/([.#][\w.\- :,>]+?)\s*\{[^}]*?[^-]color:\s*(#[0-9a-fA-F]{6})/g)) {
    const selector = m[1].trim().split('\n').pop().trim();
    if (/top-bar|back-link|badge|btn/.test(selector)) continue;   // these sit on a coloured bar, covered above
    pairs.push([dir + ' ' + selector + ' on white', m[2], '#ffffff']);
  }
}
let weakest = 99;
for (const [label, fg, bg] of pairs) {
  if (!fg || !bg) { report('contrast', 'could not read colours for: ' + label); continue; }
  const six = c => c.length === 4 ? '#' + [...c.slice(1)].map(x => x + x).join('') : c;
  const ratio = contrast(six(fg), six(bg));
  weakest = Math.min(weakest, ratio);
  if (ratio < 4.5) report('contrast', label + ' is ' + ratio.toFixed(2) + ' to 1 (' + fg + ' on ' + bg + '), below 4.5');
}
console.log('colour pairs checked:', pairs.length, '| weakest:', weakest.toFixed(2), 'to 1');
console.log(problems === 0 ? 'ALL CHECKS PASSED' : problems + ' PROBLEM(S) FOUND');
process.exit(problems === 0 ? 0 : 1);
