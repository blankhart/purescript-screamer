// Smoke tests for the bundled examples in headless Chromium: each example
// renders, responds to one interaction, and unmounts leaving no live effects
// or scopes.
//
//   node examples/smoke.mjs        (after `npm run build:examples`)
import { launch, openExample, origin } from './page.mjs';

const examples = {
  async HistoryRouter(page) {
    await page.goto(`${origin}/history-router/`);
    await expectText(page, '#page h1', 'Home');
    await page.evaluate(() => { window.historyExampleMarker = true; });
    await page.click('#login');
    if (new URL(page.url()).search !== '?return=%2Fhistory-router%2F') throw new Error(`query is ${page.url()}`);
    await expectText(page, '#return', '/history-router/');
    if (!await page.evaluate(() => window.historyExampleMarker)) throw new Error('link reloaded the page');
    await page.reload();
    await expectText(page, '#return', '/history-router/');
    await page.goBack();
    await expectText(page, '#page h1', 'Home');
    await page.goForward();
    await expectText(page, '#page h1', 'Sign in');
    await page.click('#broken');
    await expectText(page, '#page h1', 'Not found');
    await page.evaluate(() => { window.historyExampleMarker = true; });
    await page.click('#plain-home');
    await expectText(page, '#page h1', 'Home');
    if (!await page.evaluate(() => window.historyExampleMarker)) throw new Error('plain anchor reloaded the page');
  },
  async HelloWorld(page) {
    await expectText(page, '#count', '0');
    await page.click('#increment');
    await page.click('#increment');
    await page.click('#decrement');
    await expectText(page, '#count', '1');
  },

  async RainbowSpiral(page) {
    // A cursor dot and 301 spiral dots (the inactive ones hidden).
    await page.waitForFunction(() => document.querySelectorAll('#spiral .cursor').length === 302);
    // The cursor dot is placed relative to the centre of the stage.
    const box = await page.locator('#spiral').boundingBox();
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 8);
    await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('#spiral .cursor').style.left) - 150) < 1);
    // The picker changes the number of dots.
    await page.click('.picker button:nth-of-type(2)');
    await page.waitForFunction(() => document.querySelectorAll('#spiral .cursor').length === 752);
  },

  async Draggable(page) {
    const circle = page.locator('#circle-1');
    const box = await circle.boundingBox();
    const cx = await circle.getAttribute('cx');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 10, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction((before) => Number(document.querySelector('#circle-1').getAttribute('cx')) === Number(before) + 40, cx);
  },

  async Router(page) {
    await expectText(page, '#page h1', 'Home');
    await page.click('#item');
    await expectText(page, '#page h1', 'Item 42');
    if (new URL(page.url()).hash !== '#/items/42') throw new Error(`location is ${page.url()}`);
    await expectClass(page, '#item', 'current');
    await page.click('#about');
    await expectText(page, '#page h1', 'About');
    await page.goBack();
    await expectText(page, '#page h1', 'Item 42');
    await page.click('#broken');
    await expectText(page, '#page h1', 'Not found');
  },

  async WebSocket(page) {
    await expectText(page, '#status', 'Connected to wss://echo.websocket.org');
    await page.fill('#draft', 'hello');
    await page.click('button');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#lines li')).map((l) => l.className + ':' + l.textContent).join() === 'mine:hello,theirs:hello');
    await page.evaluate(() => { window.oldSocket = window.lastSocket; window.lastSocket.drop(); });
    await expectText(page, '#status', 'Retrying connection (attempt 1)');
    if (!await page.locator('button').isDisabled()) throw new Error('send enabled while disconnected');
    await expectText(page, '#status', 'Connected to wss://echo.websocket.org');
    if (!await page.evaluate(() => window.lastSocket !== window.oldSocket)) throw new Error('socket was not replaced');
    await page.fill('#draft', 'again');
    await page.click('button');
    await page.waitForFunction(() => document.querySelectorAll('#lines li').length === 4);
    const closed = await page.evaluate(() => { window.screamerExample.unmount(); return window.lastSocket.closed; });
    if (!closed) throw new Error('socket still open after unmount');
  },

  async Formlets(page) {
    const field = (n, el) => `#signup .screamer-form > label:nth-child(${n}) ${el}`;
    const errors = () => page.evaluate(() => Array.from(document.querySelectorAll('#signup .screamer-form-error')).filter((e) => !e.hidden).map((e) => e.textContent));
    const expectErrors = async (want) => {
      await page.waitForFunction((w) => JSON.stringify(Array.from(document.querySelectorAll('#signup .screamer-form-error')).filter((e) => !e.hidden).map((e) => e.textContent)) === w, JSON.stringify(want));
    };
    await expectText(page, '#status', '6 fields to fix');
    await expectErrors([]);
    // A message appears after an edit and clears when the value is fixed.
    await page.fill(field(4, 'input'), '9');
    await expectErrors(['You must be 13 or over']);
    await page.fill(field(4, 'input'), '42');
    await expectErrors([]);
    // Submitting an invalid form reveals every message.
    await page.click('#signup button[type=submit]');
    await expectErrors(['Enter your name', 'Enter your email', 'Use at least 8 characters', 'Choose a plan', 'Accept the terms to continue']);
    await page.fill(field(1, 'input'), 'Ada');
    await page.fill(field(2, 'input'), 'ada@example.com');
    await page.fill(field(3, 'input'), 'correct horse');
    await page.selectOption(field(5, 'select'), { label: 'Pro' });
    await page.check(field(6, 'input'));
    await expectErrors([]);
    await expectText(page, '#status', 'Ready');
    await page.click('#signup button[type=submit]');
    await expectText(page, '#submitted', 'Welcome, Ada (ada@example.com, 42, Pro)');
    await expectText(page, '#status', '6 fields to fix');
    if ((await errors()).length !== 0) throw new Error('messages shown after reset');
    // The wizard's second step depends on the first answer.
    await page.click('#trip .screamer-form-next');
    await expectText(page, '#trip .screamer-form-error:not([hidden])', 'Choose a kind of trip');
    await page.selectOption('#trip select', { label: 'Camping' });
    await page.click('#trip .screamer-form-next');
    await expectText(page, '#trip legend', 'Step 2: how long?');
    await page.fill('#trip input', '3');
    await expectText(page, '#plan', 'Camping for 3 nights');
    await page.click('#trip .screamer-form-back');
    await page.selectOption('#trip select', { label: 'City break' });
    await page.click('#trip .screamer-form-next');
    await page.fill('#trip input', 'Lisbon');
    await expectText(page, '#plan', 'City break in Lisbon');
  },

  async Typeahead(page) {
    const results = () => page.evaluate(() => Array.from(document.querySelectorAll('#results li')).map((l) => l.textContent).join());
    await expectText(page, '#status', 'Type at least three letters');
    // A query still in flight when the next one is sent is cancelled, so
    // only the latest results are ever shown, however the latencies fall.
    await page.fill('#search', 'app');
    await page.waitForTimeout(200);
    await page.fill('#search', 'grape');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#results li')).map((l) => l.textContent).join() === 'grape,grapefruit');
    await page.waitForTimeout(800);
    if ((await results()) !== 'grape,grapefruit') throw new Error(`stale results: ${await results()}`);
    await expectText(page, '#status', '2 results');
    await page.press('#search', 'ArrowDown');
    await expectClass(page, '#results li:nth-child(2)', 'selected');
    await page.press('#search', 'Enter');
    await expectText(page, '#chosen', 'Chosen: grapefruit');
    // Typing more keeps the old list on screen until the new one arrives.
    await page.type('#search', 'f', { delay: 0 });
    await expectText(page, '#status', '1 result');
    if ((await results()) !== 'grapefruit') throw new Error(`results: ${await results()}`);
  },

  async CodeMirror(page) {
    const count = (id) => page.evaluate((i) => document.querySelector(`#${i} .count`).textContent, id);
    const editorText = (id) => page.evaluate((i) => Array.from(document.querySelectorAll(`#${i} .cm-line`)).map((l) => l.textContent).join('\n'), id);
    await page.waitForFunction(() => document.querySelectorAll('.cm-editor').length === 2);
    const initial = await editorText('editor-1');
    const before = await count('editor-1');
    const other = await count('editor-2');
    // Typing updates the count and preview; the other instance is untouched.
    await page.click('#editor-1 .cm-content');
    await page.keyboard.press('Control+End');
    await page.keyboard.type('xyz');
    await expectText(page, '#editor-1 .count', `${parseInt(before) + 3} characters`);
    await page.waitForFunction(() => document.querySelector('#editor-1 .preview').textContent.endsWith('xyz'));
    if ((await count('editor-2')) !== other) throw new Error('the second editor changed');
    // Reset writes the source, and the editor follows.
    await page.click('#editor-1 .reset');
    await expectText(page, '#editor-1 .count', before);
    await page.waitForFunction((t) => Array.from(document.querySelectorAll('#editor-1 .cm-line')).map((l) => l.textContent).join('\n') === t, initial);
    // Read-only ignores typing.
    await page.click('#editor-1 .read-only');
    await expectText(page, '#editor-1 .read-only', 'Make editable');
    await page.click('#editor-1 .cm-content');
    await page.keyboard.type('nope');
    await page.waitForTimeout(100);
    if ((await count('editor-1')) !== before) throw new Error('a read-only editor accepted typing');
    const left = await page.evaluate(() => { window.screamerExample.unmount(); return document.querySelectorAll('.cm-editor').length; });
    if (left !== 0) throw new Error(`${left} editors left after unmount`);
  },

  async Motion(page) {
    const texts = (sel) => page.evaluate((s) => Array.from(document.querySelectorAll(s)).map((l) => l.textContent).join(), sel);
    // Animations on the rows (the buttons have CSS hover transitions).
    const rowAnimations = () => page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.tagName === 'LI').length);
    await page.waitForFunction(() => document.querySelectorAll('#todo li').length === 3);
    // A task carried to the other list: both copies animate while it moves,
    // the old one leaves when its animation finishes, and the bar eases.
    await page.click('#todo li:nth-child(1)');
    await page.waitForFunction(() => document.getAnimations().some((a) => a.effect?.target?.tagName === 'LI'));
    await page.waitForFunction(() => document.querySelectorAll('#todo li').length === 2 && !document.getAnimations().some((a) => a.effect?.target?.tagName === 'LI'));
    if ((await texts('#done li')) !== 'Water the plants,Fix the gate') throw new Error(`done: ${await texts('#done li')}`);
    await page.waitForFunction(() => document.querySelector('#fill').style.width === '50%');
    // Reversing moves rows with FLIP; a new task fades in.
    await page.click('#reverse');
    await page.waitForFunction(() => document.getAnimations().some((a) => a.effect?.target?.tagName === 'LI'));
    await page.waitForFunction(() => !document.getAnimations().some((a) => a.effect?.target?.tagName === 'LI'));
    if ((await texts('#todo li')) !== 'Buy bread,Answer the letter') throw new Error(`todo: ${await texts('#todo li')}`);
    await page.click('#add');
    await page.waitForFunction(() => document.getAnimations().some((a) => a.effect?.target?.textContent === 'Task 5'));
    await page.waitForFunction(() => !document.getAnimations().some((a) => a.effect?.target?.tagName === 'LI'));
    if ((await texts('#todo li')) !== 'Buy bread,Answer the letter,Task 5') throw new Error(`todo: ${await texts('#todo li')}`);
    // With reduced motion, a move finishes at once.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#todo li:nth-child(1)');
    await page.waitForFunction(() => document.querySelectorAll('#todo li').length === 2);
    if ((await rowAnimations()) !== 0) throw new Error('rows animated under reduced motion');
  },

  async JsFrameworksBenchmark(page) {
    await page.click('#run');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1000);
    await page.click('tbody tr:nth-child(2) td:nth-child(2) a');
    await expectClass(page, 'tbody tr:nth-child(2)', 'danger');
    await page.click('tbody tr:nth-child(3) td:nth-child(2) a');
    await expectClass(page, 'tbody tr:nth-child(2)', '');
    await page.click('#update');
    await page.waitForFunction(() => document.querySelector('tbody tr td:nth-child(2) a').textContent.endsWith(' !!!'));
  },
};

async function expectText(page, selector, text) {
  try {
    await page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent === t, [selector, text]);
  } catch (error) {
    throw new Error(`${selector}: expected ${JSON.stringify(text)} at ${page.url()}: ${error.message}`);
  }
}

async function expectClass(page, selector, cls) {
  await page.waitForFunction(([s, c]) => document.querySelector(s)?.className === c, [selector, cls]);
}

const browser = await launch();
let failed = false;
for (const [name, interact] of Object.entries(examples)) {
  let page = null;
  try {
    const opened = await openExample(browser, name);
    page = opened.page;
    page.setDefaultTimeout(10000);
    const errors = opened.errors;
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => window.screamerExample !== undefined, null, { timeout: 5000 });
    const before = await page.evaluate(() => window.screamerExample.stats());
    if (before.liveEffects === 0) throw new Error('no live effects after mount');
    await interact(page);
    const after = await page.evaluate(() => {
      window.screamerExample.unmount(); // a second unmount is a no-op
      return { stats: window.screamerExample.stats(), html: document.querySelector('main').innerHTML };
    });
    if (after.stats.liveEffects !== 0 || after.stats.liveScopes !== 0) {
      throw new Error(`after unmount: ${after.stats.liveEffects} live effects, ${after.stats.liveScopes} live scopes`);
    }
    if (after.html !== '') throw new Error(`after unmount, main still holds ${after.html.slice(0, 80)}`);
    if (errors.length > 0) throw new Error(`page errors: ${errors.join('; ')}`);
    console.log(`ok     ${name}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL   ${name}: ${e.message}`);
  } finally {
    if (page !== null) await page.close();
  }
}
await browser.close();
if (failed) process.exitCode = 1;
