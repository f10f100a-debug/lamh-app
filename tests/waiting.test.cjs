const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');

function setup() {
  let now = 100000, id = 0, calls = 0, starts = 0, finishes = 0;
  let response = { status: 'waiting', start_at: null };
  const timers = new Map(), elements = new Map(), events = {};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      textContent: '', value: '', classList: { toggle() {} }, addEventListener() {}
    });
    return elements.get(selector);
  };
  const context = vm.createContext({
    window: { location: { search: '?code=A1' }, supabase: { createClient: () => ({
      rpc: async () => { calls++; if (response instanceof Error) throw response; return { data: response }; }
    }) } },
    document: { querySelector: element, querySelectorAll: () => [], hidden: false,
      addEventListener: (name, fn) => events[name] = fn },
    URLSearchParams, console, Date: class extends Date { static now() { return now; } },
    setInterval: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    clearInterval: handle => timers.delete(handle)
  });
  vm.runInContext(source, context);
  context.recordStart = () => starts++;
  context.recordFinish = () => finishes++;
  vm.runInContext('startQuiz = async () => { stopWaiting(); recordStart(); }; finishCompetition = async () => { stopWaiting(); recordFinish(); };', context);
  return {
    run: code => vm.runInContext(code, context),
    set: value => response = value, time: value => now = value,
    count: () => element('#count').textContent, note: () => element('#waitingNote').textContent,
    timers, events, calls: () => calls, starts: () => starts, finishes: () => finishes
  };
}

test('missing/invalid dates show clear text and keep polling', async () => {
  const app = setup();
  await app.run('loadCompetition()');
  assert.match(app.count(), /بانتظار تحديد/);
  assert.equal(app.timers.size, 1);
  app.set({ status: 'waiting', start_at: 'invalid' });
  await app.run('pollWaitingCompetition()');
  assert.match(app.count(), /بانتظار تحديد/);
  assert.equal(app.calls(), 2);
});

test('polling discovers, reschedules and removes countdown without cancelling polling', async () => {
  const app = setup(); await app.run('loadCompetition()');
  app.set({ status: 'waiting', start_at: new Date(165000).toISOString() });
  await app.run('pollWaitingCompetition()');
  assert.equal(app.count(), '01:05'); assert.equal(app.timers.size, 2);
  app.time(102500); app.run('updateWaitingCountdown()'); assert.equal(app.count(), '01:03');
  app.set({ status: 'waiting', start_at: new Date(3702500).toISOString() });
  await app.run('pollWaitingCompetition()'); assert.equal(app.count(), '01:00:00');
  app.set({ status: 'waiting', start_at: null });
  await app.run('pollWaitingCompetition()'); assert.equal(app.timers.size, 1);
});

test('live competition starts once at deadline, never early, and clears both timers', async () => {
  const app = setup(); app.set({ status: 'live', start_at: new Date(101000).toISOString() });
  await app.run('loadCompetition()'); assert.equal(app.starts(), 0);
  app.time(100999); app.run('updateWaitingCountdown()'); assert.equal(app.count(), '00:01');
  app.time(101000); app.run('updateWaitingCountdown()');
  await app.run('pollWaitingCompetition()'); assert.equal(app.starts(), 1); assert.equal(app.timers.size, 0);
});

test('past waiting date respects server live gate, then responds to live status', async () => {
  const app = setup(); app.set({ status: 'waiting', start_at: new Date(90000).toISOString() });
  await app.run('loadCompetition()'); assert.match(app.count(), /بانتظار تشغيل/); assert.equal(app.starts(), 0);
  app.set({ status: 'live', start_at: new Date(90000).toISOString() });
  await app.run('pollWaitingCompetition()'); assert.equal(app.starts(), 1);
});

test('poll errors recover and finished state stops all waiting timers', async () => {
  const app = setup(); app.set(new Error('offline')); await app.run('loadCompetition()');
  assert.match(app.note(), /نحاول الاتصال/); assert.equal(app.timers.size, 1);
  app.set({ status: 'finished', start_at: null }); await app.run('pollWaitingCompetition()');
  assert.equal(app.finishes(), 1); assert.equal(app.timers.size, 0);
});

test('return from background recomputes elapsed time instead of decrementing ticks', async () => {
  const app = setup(); app.set({ status: 'live', start_at: new Date(200000).toISOString() });
  await app.run('loadCompetition()'); app.time(210000); app.events.visibilitychange();
  assert.equal(app.starts(), 1); assert.equal(app.timers.size, 0);
});
