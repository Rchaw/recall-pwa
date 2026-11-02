import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import vm from 'node:vm';
import {parseCSV, parseDeckCSV, quizKeyAction, answerKey, shuffle, orient, answerPool, makeQuestion, createSession, recordAnswer, score} from './core.js';

function toCSV(cards) {
  const quote = s => '"' + s.replace(/"/g, '""') + '"';
  return '\uFEFFFRONT,BACK\r\n' + cards.map(c => `${quote(c.front)},${quote(c.back)}`).join('\r\n');
}
const cards = ['Alpha','Beta','Gamma','Delta','Epsilon',' alpha '].map((back, i) => ({front:`Question ${i}`, back}));
function random(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
test('import requires four unique entries independently in both FRONT and BACK', () => {
  const error = {message:'Insufficient flashcards. Try a different deck.'};
  for (const count of [1,2,3]) assert.throws(() => parseDeckCSV(toCSV(cards.slice(0,count))),error);
  assert.throws(() => parseDeckCSV('FRONT,BACK'),error);
  assert.throws(() => parseDeckCSV(toCSV(cards.slice(0,4).map(c => ({...c,front:'same'})))),error);
  assert.throws(() => parseDeckCSV(toCSV(cards.slice(0,4).map(c => ({...c,back:'same'})))),error);
  const duplicateFront = [{front:'one',back:'a'},{front:'two',back:'b'},{front:'three',back:'c'},{front:' ONE ',back:'d'}];
  assert.throws(() => parseDeckCSV(toCSV(duplicateFront)),error);
  assert.throws(() => parseDeckCSV(toCSV(duplicateFront.map(c => ({front:c.back,back:c.front})))),error);
  assert.equal(parseDeckCSV(toCSV(cards.slice(0,4))).length,4);
  assert.equal(parseDeckCSV(toCSV(cards)).length,cards.length);
});
test('any fresh key continues after incorrect feedback, without selecting the next answer', () => {
  for(const key of ['a','1','2','3','4','Enter',' ','ArrowUp','ArrowLeft','Tab','Escape','Shift','Control','Alt','Meta','F2']) {
    const s = createSession(cards,false,undefined,random(1));
    const q = makeQuestion(cards,s.order[0],false,random(2));
    const wrong = (q.correct + 1) % 4;
    assert.deepEqual(quizKeyAction(s,{key:String(wrong + 1)}),{type:'answer',choice:wrong});
    recordAnswer(s,q,wrong);
    assert.deepEqual(quizKeyAction(s,{key}),{type:'continue'});
    assert.equal(quizKeyAction(s,{key,repeat:true}),null);
    assert.equal(s.answers.length,1);
    s.position++;
    assert.equal(s.answers[s.position],undefined);
  }
});
test('correct feedback waits for automatic advance; unscored questions require 1–4', () => {
  const s = createSession(cards,false); const q = makeQuestion(cards,s.order[0],false);
  for(const key of ['a','Enter',' ','ArrowRight']) assert.equal(quizKeyAction(s,{key}),null);
  assert.equal(quizKeyAction(s,{key:'1',ctrlKey:true}),null);
  recordAnswer(s,q,q.correct);
  for(const key of ['Enter',' ','ArrowRight']) assert.equal(quizKeyAction(s,{key}),null);
  for(const key of ['a','1','Tab']) assert.equal(quizKeyAction(s,{key}),null);
  assert.equal(quizKeyAction(s,{key:'Enter',isComposing:true}),null);
  s.position = s.order.length;
  assert.equal(quizKeyAction(s,{key:'1'}),null);
});
test('CSV handles BOM, reversed headers, CRLF, comma, multiline and escaped quotes', () => {
  const actual = parseCSV('\uFEFFBACK,FRONT\r\n"One, two","What is ""quoted""?"\r\n"Line 1\nLine 2",Question 2\r\n\r\n');
  assert.deepEqual(actual,[{front:'What is "quoted"?',back:'One, two'},{front:'Question 2',back:'Line 1\nLine 2'}]);
});
test('CSV round-trip preserves punctuation, Unicode and multiline values', () => {
  const original = [{front:'♥, "你好"\nNext',back:'Café 😄'},{front:'Equation',back:'x = 1, y = 2'}];
  assert.deepEqual(parseCSV(toCSV(original)), original);
});
test('CSV rejects malformed input with actionable errors', () => {
  for (const text of ['', 'QUESTION,ANSWER\na,b','FRONT,FRONT\na,b','FRONT,BACK,EXTRA\na,b,c','FRONT,BACK','FRONT,BACK\na,','FRONT,BACK\na,b,c','FRONT,BACK\n"a,b','FRONT,BACK\n"a"x,b','FRONT,BACK\na"b,c']) assert.throws(() => parseCSV(text));
});
test('CSV accepts whitespace, blank lines and case-insensitive headers', () => {
  assert.deepEqual(parseCSV('\n front , back \n\na,b\n  ,  \nc,d'),[{front:'a',back:'b'},{front:'c',back:'d'}]);
});
test('large imports are bounded', () => {
  assert.equal(parseCSV('FRONT,BACK\n' + 'a,b\n'.repeat(10000)).length,10000);
  assert.throws(() => parseCSV('FRONT,BACK\n' + 'a,b\n'.repeat(10001)), /10,000/);
});
test('shuffling is a permutation, preserves source and varies across seeds', () => {
  const original = [0,1,2,3,4,5,6,7];
  const a = shuffle(original, random(8)), b = shuffle(original, random(9));
  assert.deepEqual([...a].sort(),original); assert.notDeepEqual(a,b); assert.deepEqual(original,[0,1,2,3,4,5,6,7]);
});
test('all MCQs have exactly one correct answer and three distinct distractors', () => {
  for (let seed = 0; seed < 100; seed++) for (let index = 0; index < cards.length; index++) {
    const q = makeQuestion(cards,index,false,random(seed));
    assert.equal(q.choices.length,4); assert.equal(new Set(q.choices.map(answerKey)).size,4);
    assert.equal(q.choices[q.correct],cards[index].back); assert.equal(q.question,cards[index].front);
    assert.ok(q.choices.every(answer => cards.some(c => c.back === answer)));
  }
});
test('duplicate comparison normalizes case, Unicode and whitespace', () => {
  assert.equal(answerKey('  ALPHA\n beta '),answerKey('alpha beta'));
  assert.equal(answerKey('Ａ'),answerKey('a'));
  assert.equal(answerPool(cards,false).length,5);
});
test('too few distinct answers blocks MCQ; swapped direction uses FRONT answers', () => {
  const duplicateBacks = ['one','two','three','four'].map(front => ({front,back:'same'}));
  assert.throws(() => makeQuestion(duplicateBacks,0,false),/Insufficient flashcards/);
  const q = makeQuestion(duplicateBacks,0,true,random(5));
  assert.equal(q.question,'same'); assert.equal(q.choices[q.correct],'one');
  assert.deepEqual(orient(cards[0],true),{question:'Alpha',answer:'Question 0'});
});
test('incorrect cards return among remaining questions until correct, with attempt scoring', () => {
  const s = createSession(cards, false, undefined, random(31), false);
  const q = makeQuestion(cards, 0, false, random(1));
  assert.equal(recordAnswer(s, q, (q.correct + 1) % 4, () => 0), true);
  assert.deepEqual(s.order, [0, 1, 2, 3, 4, 0, 5]);
  assert.equal(recordAnswer(s, q, q.correct), false);
  s.position++;
  while (s.position < s.order.length) {
    const next = makeQuestion(cards, s.order[s.position], false, random(2));
    recordAnswer(s, next, next.correct); s.position++;
  }
  assert.deepEqual(score(s), {correct:6, wrong:1, answered:7, total:7});
});
test('invalid keys never count as answers and missed-card runs use the full distractor pool', () => {
  const s = createSession(cards,false,[1]); const q = makeQuestion(cards,1,false);
  for(const choice of [-1,4,NaN,0.5,'1']) assert.equal(recordAnswer(s,q,choice),false);
  assert.deepEqual(s.order,[1]); assert.equal(q.choices.length,4);
  assert.equal(recordAnswer(s,q,q.correct),true); assert.equal(score(s).correct,1);
});

async function serviceWorkerHarness(scope = 'https://example.test/recall/') {
  const listeners = {}, stores = new Map(); let claimed = false, skipped = false, network = true;
  const requests = [];
  const fetch = async request => {
    const url = typeof request === 'string' ? request : request.url; requests.push(url);
    if(!network) throw new Error('Offline');
    const relative = new URL(url).pathname.slice(new URL(scope).pathname.length) || 'index.html';
    return new Response(await readFile(new URL(relative,import.meta.url)));
  };
  const caches = {
    keys:async () => [...stores.keys()], delete:async key => stores.delete(key),
    open:async key => {
      if(!stores.has(key)) stores.set(key,new Map()); const map = stores.get(key);
      return {
        addAll:async requests => { const entries = await Promise.all(requests.map(async req => [req.url,await fetch(req)])); entries.forEach(([url,response]) => map.set(url,response)); },
        match:async url => map.get(url)?.clone(),
        put:async (url,response) => { map.set(url,response); }
      };
    }
  };
  vm.runInNewContext(await readFile(new URL('./sw.js',import.meta.url),'utf8'),{URL,Request,caches,fetch,self:{registration:{scope},clients:{claim:async () => {claimed = true;}},skipWaiting:() => {skipped = true;},addEventListener:(event,fn) => {listeners[event] = fn;}}});
  return {listeners,stores,requests,goOffline:() => {network = false;},get claimed(){return claimed;},get skipped(){return skipped;},async lifecycle(name){let wait;listeners[name]({waitUntil:p=>{wait=p;}});await wait;},async request(path,method='GET'){let response;listeners.fetch({request:new Request(new URL(path,scope),{method}),respondWith:p=>{response=p;}});return response;}};
}
test('PWA precaches every runtime asset and serves it offline under a GitHub repository path', async () => {
  const worker = await serviceWorkerHarness(); await worker.lifecycle('install'); await worker.lifecycle('activate');
  assert.ok(worker.claimed); assert.equal(worker.skipped,false);
  const before = worker.requests.length;
  const online = await worker.request('./app.js'); assert.equal(online.status,200);
  assert.equal(worker.requests.length,before + 1);
  worker.goOffline();
  for(const path of ['./','./index.html?launch=1','./app.js','./core.js','./styles.css','./manifest.webmanifest','./icon-192.png','./apple-touch-icon.png']) {
    const response = await worker.request(path); assert.equal(response.status,200); assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  assert.equal(await worker.request('https://elsewhere.test/'),undefined);
  assert.equal(await worker.request('./not-cached.txt'),undefined);
  assert.equal(await worker.request('./','POST'),undefined);
});
test('offline cache is scoped to this app and has no manual update handler', async () => {
  const worker = await serviceWorkerHarness(); await worker.lifecycle('install'); await worker.lifecycle('activate');
  assert.equal(worker.stores.has('recall-/recall/-assets'),true);
  assert.equal(worker.listeners.message,undefined);
});
test('manifest icons and HTML resources exist, use portable relative paths, and have unique element IDs', async () => {
  const manifest = JSON.parse(await readFile(new URL('./manifest.webmanifest',import.meta.url)));
  assert.equal(manifest.start_url,'./'); assert.equal(manifest.scope,'./'); assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons) {
    const png = await readFile(new URL(icon.src,import.meta.url)); const [width,height] = icon.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16),width); assert.equal(png.readUInt32BE(20),height);
  }
  const html = await readFile(new URL('./index.html',import.meta.url),'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]); assert.equal(ids.length,new Set(ids).size);
  for(const match of html.matchAll(/(?:href|src)="(\.\/[^"#]+)"/g)) await stat(new URL(match[1],import.meta.url));
  const js = await readFile(new URL('./app.js',import.meta.url),'utf8');
  for(const match of js.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]),`Missing DOM element: ${match[1]}`);
});

// Exercise the real event handlers in a lightweight DOM fixture. This is not a visual browser test.
async function appHarness() {
  class Element {
    constructor(tag = 'div') { this.tag = tag; this.tagName = tag.toUpperCase(); this.children = []; this.textContent = ''; this.hidden = false; this.style = {}; this.dataset = {}; this.attrs = {}; this.files = []; this.listeners = {}; this.classes = new Set(); this.classList = {add:v=>this.classes.add(v),toggle:(v,on)=>on ? this.classes.add(v) : this.classes.delete(v)}; }
    setAttribute(k,v) { this.attrs[k]=v; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(type,fn) { this.listeners[type]=fn; }
    focus() {}
    click() { this.onclick?.(); }
    showModal() { this.open=true; }
    close() { this.open=false; }
    closest(selector) { return selector.split(',').includes(this.tag) ? this : null; }
    get lastElementChild() { if(!this.children.length) this.children.push(new Element()); return this.children.at(-1); }
  }
  const html = await readFile(new URL('./index.html',import.meta.url),'utf8');
  const nodes = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const handlers={}, removed=[], timers = new Map(); let nextTimer = 1;
  const fakeSetTimeout = (fn, delay) => { const id = nextTimer++; timers.set(id,{fn,delay}); return id; };
  const fakeClearTimeout = id => timers.delete(id);
  const document={documentElement:{style:{setProperty(){}}},getElementById:id=>nodes[id],querySelector:()=>Object.values(nodes).find(n=>n.open)||null,querySelectorAll:()=>[],createElement:tag=>new Element(tag)};
  const context=vm.createContext({document,Element,URL,Blob,setTimeout:fakeSetTimeout,clearTimeout:fakeClearTimeout,location:{href:'https://example.test/recall/'},navigator:{onLine:true},localStorage:{removeItem:key=>removed.push(key),getItem:()=>assert.fail('Deck data must not be read from storage'),setItem:()=>assert.fail('Deck data must not be saved')},window:{addEventListener:(type,fn)=>{handlers[type]=fn;},isSecureContext:true}});
  const core=(await readFile(new URL('./core.js',import.meta.url),'utf8')).replace(/^export /gm,'');
  const app=(await readFile(new URL('./app.js',import.meta.url),'utf8')).replace(/^import .*;\n/,'');
  vm.runInContext(core+'\n'+app,context);
  return {nodes,removed,runTimers(){const pending=[...timers.values()]; timers.clear(); for(const timer of pending) timer.fn();}, timerDelays(){return [...timers.values()].map(t=>t.delay);},inspect:expr=>vm.runInContext(expr,context),async import(text,name='Test.csv'){nodes['file-input'].files=[{name,size:text.length,text:async()=>text}];await nodes['file-input'].onchange();},key(key,repeat=false,targetTag='div',inputType=''){ const target=new Element(targetTag); target.type=inputType; let prevented=false; handlers.keydown({key,repeat,target,preventDefault(){prevented=true;}}); return prevented; }};
}
test('real app imports one temporary deck, rejects invalid replacements, and clears on End session or reload', async () => {
  const app=await appHarness();
  assert.equal(app.inspect('currentDeck'),null);
  assert.deepEqual(app.removed,[]);
  await app.import(toCSV(cards));
  assert.equal(app.inspect('currentDeck.cards.length'),6);
  assert.equal(app.nodes['deck-panel'].hidden,false);
  await app.import(toCSV(cards.slice(0,3)));
  assert.equal(app.inspect('currentDeck'),null);
  assert.equal(app.nodes['deck-panel'].hidden,true);
  assert.equal(app.nodes.notice.textContent,'Insufficient flashcards. Try a different deck.');
  await app.import(toCSV(cards));
  app.nodes['end-session'].click(); app.nodes['accept-confirm'].click();
  assert.equal(app.inspect('currentDeck'),null);
  assert.equal(app.inspect('session'),null);
  assert.equal(app.nodes['card-text'].textContent,'');
  assert.equal(app.nodes.choices.children.length,0);
  assert.equal((await appHarness()).inspect('currentDeck'),null);
});
test('real app wrong-answer key and tap continuation never score the next question', async () => {
  const app=await appHarness(); await app.import(toCSV(cards)); app.nodes['quiz-mode'].click();
  const wrong=app.inspect('(question.correct + 1) % 4'); app.key(String(wrong+1));
  assert.equal(app.inspect('session.position'),0); assert.equal(app.inspect('session.answers.length'),1);
  app.key('1',true); assert.equal(app.inspect('session.position'),0);
  app.key('1'); assert.equal(app.inspect('session.position'),1); assert.equal(app.inspect('session.answers.length'),1);
  const wrong2=app.inspect('(question.correct + 1) % 4'); app.key(String(wrong2+1));
  assert.equal(app.nodes.feedback.textContent,'✕');
  app.nodes.choices.children[0].click();
  assert.equal(app.inspect('session.position'),2); assert.equal(app.inspect('session.answers.length'),2);
});


test('MCQ question order can follow import order while answer choices remain randomized', () => {
  const ordered = createSession(cards, false, undefined, random(4), false);
  assert.deepEqual(ordered.order, cards.map((_, i) => i));
  assert.deepEqual(createSession(cards, false, [4, 1, 3], random(4), false).order, [1, 3, 4]);
  assert.notDeepEqual(createSession(cards, false, undefined, random(4), true).order, ordered.order);
  const variants = new Set(Array.from({length: 12}, (_, i) => makeQuestion(cards, 0, false, random(i + 1)).choices.join('|')));
  assert.ok(variants.size > 1);
});

test('MCQ shuffle switch restarts safely and respects cancellation', async () => {
  const app = await appHarness(); await app.import(toCSV(cards)); app.nodes['quiz-mode'].click();
  assert.equal(app.inspect('quizShuffled'), false);
  assert.deepEqual(Array.from(app.inspect('session.order')), cards.map((_, i) => i));
  app.key('1');
  app.nodes['quiz-shuffle'].checked = true; app.nodes['quiz-shuffle'].onchange();
  assert.equal(app.nodes['quiz-shuffle'].checked, false);
  app.nodes['cancel-confirm'].click();
  assert.equal(app.inspect('quizShuffled'), false);
  app.nodes['quiz-shuffle'].checked = true; app.nodes['quiz-shuffle'].onchange();
  app.nodes['accept-confirm'].click();
  assert.equal(app.inspect('quizShuffled'), true);
  assert.equal(app.inspect('session.answers.length'), 0);
});


test('missed cards are reinserted repeatedly in both order modes including at the end', () => {
  for (const shuffled of [false, true]) {
    const s = createSession(cards, false, [0,1,2,3], random(2), shuffled);
    const first = s.order[0], q = makeQuestion(cards, first, false, random(3));
    recordAnswer(s, q, (q.correct+1)%4, () => 0.99);
    assert.equal(s.order.at(-1), first);
    while (s.position < s.order.length-1) { s.position++; if(s.position < s.order.length-1) {const n=makeQuestion(cards,s.order[s.position],false); recordAnswer(s,n,n.correct);} }
    const repeat = makeQuestion(cards, first, false);
    recordAnswer(s, repeat, (repeat.correct+1)%4, () => 0);
    assert.equal(s.order.at(-1), first);
    s.position++; recordAnswer(s, repeat, repeat.correct); s.position++;
    assert.equal(s.position, s.order.length);
    assert.equal(score(s).wrong, 2);
  }
});


test('missed cards return after four remaining cards or at the end in either order mode', () => {
  for (const shuffled of [false, true]) for (let remaining = 0; remaining <= 5; remaining++) {
    const s = createSession(cards, false, Array.from({length: remaining + 1}, (_, i) => i), random(9), shuffled);
    const before = [...s.order], missed = before[0];
    const q = makeQuestion(cards, missed, false, random(4));
    recordAnswer(s, q, (q.correct + 1) % 4);
    const expected = [...before]; expected.splice(Math.min(5, before.length), 0, missed);
    assert.deepEqual(s.order, expected, `shuffle=${shuffled}, remaining=${remaining}`);
  }
});

test('compact counter tracks unique reviewed and cleared cards, and answer taps advance', async () => {
  const app = await appHarness(); await app.import(toCSV(cards));
  assert.equal(app.nodes.progress.textContent, '1/6');
  app.nodes.next.click(); assert.equal(app.nodes.progress.textContent, '2/6');
  app.nodes.previous.click(); assert.equal(app.nodes.progress.textContent, '2/6');
  app.nodes['quiz-mode'].click(); assert.equal(app.nodes.progress.textContent, '0/6');
  const wrong = app.inspect('(question.correct + 1) % 4'); app.key(String(wrong + 1));
  assert.equal(app.nodes.progress.textContent, '0/6');
  app.nodes.choices.children[0].click(); assert.equal(app.inspect('session.position'), 1);
  app.key(String(app.inspect('question.correct') + 1));
  assert.equal(app.nodes.progress.textContent, '1/6');
  app.nodes.choices.children[0].click(); assert.equal(app.inspect('session.position'), 1);
  assert.deepEqual(app.timerDelays(), [800]); app.runTimers();
  assert.equal(app.inspect('session.position'), 2); assert.equal(app.inspect('session.answers.length'), 2);
});


test('counter retains the imported total at completion and when practicing again', async () => {
  const app = await appHarness(); await app.import(toCSV(cards)); app.nodes['quiz-mode'].click();
  app.key(String((app.inspect('question.correct') + 1) % 4 + 1)); app.key('a');
  while (app.inspect('session.position < session.order.length')) {
    app.key(String(app.inspect('question.correct') + 1)); app.runTimers();
  }
  assert.equal(app.nodes.progress.textContent, '6/6');
  app.nodes['practice-again'].click(); assert.equal(app.nodes.progress.textContent, '0/6');
  app.key(String(app.inspect('question.correct') + 1)); app.runTimers();
  assert.equal(app.nodes.progress.textContent, '1/6');
});


test('A–D choices map to 1–4 and correct feedback advances only once', async () => {
  const app = await appHarness(); await app.import(toCSV(cards)); app.nodes['quiz-mode'].click();
  assert.deepEqual(app.nodes.choices.children.map(c => c.children[0].textContent), ['A','B','C','D']);
  const correct = app.inspect('question.correct'); app.key(String(correct + 1));
  assert.equal(app.nodes.choices.children[correct].classes.has('correct'), true);
  assert.equal(app.inspect('session.position'), 0); app.key('1');
  assert.equal(app.inspect('session.answers.length'), 1); app.runTimers();
  assert.equal(app.inspect('session.position'), 1); assert.equal(app.inspect('session.answers.length'), 1);
});

test('automatic advance waits for dialogs and is cancelled when leaving a session', async () => {
  const app = await appHarness(); await app.import(toCSV(cards)); app.nodes['quiz-mode'].click();
  app.key(String(app.inspect('question.correct') + 1)); app.nodes['end-session'].click();
  app.runTimers(); assert.equal(app.inspect('session.position'), 0);
  app.nodes['cancel-confirm'].click(); app.runTimers(); assert.equal(app.inspect('session.position'), 1);
  app.key(String(app.inspect('question.correct') + 1)); app.nodes['end-session'].click();
  app.nodes['accept-confirm'].click(); app.runTimers(); assert.equal(app.inspect('session'), null);
});


test('study shortcuts still work after a switch keeps keyboard focus', async () => {
  const app = await appHarness(); await app.import(toCSV(cards));
  assert.equal(app.key('ArrowRight',false,'input','checkbox'), true);
  assert.equal(app.nodes.progress.textContent,'2/6');
  assert.equal(app.key('ArrowRight',false,'input','text'), false);
  assert.equal(app.nodes.progress.textContent,'2/6');
  app.nodes['quiz-mode'].click();
  const wrong = app.inspect('(question.correct + 1) % 4');
  assert.equal(app.key(String(wrong+1),false,'input','checkbox'), true);
  assert.equal(app.inspect('session.answers.length'),1);
  assert.equal(app.key('ArrowDown',false,'input','checkbox'), true);
  assert.equal(app.inspect('session.position'),1);
});


test('completion lists each missed card once and retries those cards with full-deck distractors', async () => {
  const app=await appHarness(); await app.import(toCSV(cards)); app.nodes['quiz-mode'].click();
  for (let n=0; n<2; n++) { const wrong=app.inspect('(question.correct + 1) % 4'); app.key(String(wrong+1)); app.key('a'); }
  let failedFirstAgain = false;
  while (app.inspect('session.position < session.order.length')) {
    if (!failedFirstAgain && app.inspect('session.order[session.position] === session.answers[0].index')) {
      app.key(String(app.inspect('(question.correct + 1) % 4') + 1)); app.key('a'); failedFirstAgain = true;
    } else { app.key(String(app.inspect('question.correct') + 1)); app.runTimers(); }
  }
  assert.equal(failedFirstAgain,true);
  assert.equal(app.nodes['quiz-results'].hidden,false);
  assert.equal(app.nodes['retry-missed'].hidden,false);
  assert.equal(app.nodes['missed-list'].children.length,2);
  const expected = Array.from(app.inspect('[...new Set(session.answers.filter(a => !a.correct).map(a => a.index))].sort((a,b)=>a-b)'));
  app.nodes['retry-missed'].click();
  assert.deepEqual(Array.from(app.inspect('session.order')),expected);
  assert.equal(app.inspect('question.choices.length'),4);
  assert.equal(app.nodes.progress.textContent,'0/6');
});

test('a perfect run hides missed-card practice and the list', async () => {
  const app=await appHarness(); await app.import(toCSV(cards)); app.nodes['quiz-mode'].click();
  while (app.inspect('session.position < session.order.length')) { app.key(String(app.inspect('question.correct')+1)); app.runTimers(); }
  assert.equal(app.nodes['retry-missed'].hidden,true);
  assert.equal(app.nodes['missed-list'].children.length,0);
});
