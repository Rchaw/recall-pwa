export const answerKey = value => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');

export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const finishField = () => { row.push(field); field = ''; closed = false; };
  const finishRow = () => { finishField(); if (row.some(v => v.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',') finishField();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else if (c === '"') {
      if (field || closed) throw new Error('Unexpected quote. Put quotes around the entire field and double any quotes inside it.');
      quoted = true;
    } else if (closed) {
      if (c !== ' ' && c !== '\t') throw new Error('Unexpected text after a closing quote.');
    } else field += c;
  }
  if (quoted) throw new Error('A quoted field is missing its closing quote.');
  if (field || row.length || closed) finishRow();
  const headers = rows.shift()?.map(v => v.trim().toUpperCase());
  if (!headers || headers.length !== 2 || !headers.includes('FRONT') || !headers.includes('BACK')) {
    throw new Error('Use exactly two columns with the headers FRONT and BACK.');
  }
  if (!rows.length) throw new Error('Insufficient flashcards. Try a different deck.');
  if (rows.length > 10000) throw new Error('Import up to 10,000 cards in one deck.');
  return rows.map((r, i) => {
    if (r.length !== 2 || r.some(v => !v.trim())) throw new Error(`Card ${i + 1} needs exactly two nonempty fields. Put fields containing commas or line breaks in double quotes.`);
    return { front: r[headers.indexOf('FRONT')].trim(), back: r[headers.indexOf('BACK')].trim() };
  });
}

export function parseDeckCSV(text) {
  const cards = parseCSV(text);
  if (['front', 'back'].some(side => new Set(cards.map(card => answerKey(card[side]))).size < 4)) {
    throw new Error('Insufficient flashcards. Try a different deck.');
  }
  return cards;
}

export function quizKeyAction(session, event) {
  if (event.repeat || event.isComposing || !session || session.position >= session.order.length) return null;
  const result = session.answers[session.position];
  // Inspect feedback first: the continue keystroke must never answer the next question.
  if (result && !result.correct) return {type:'continue'};
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (result) return null;
  return /^[1-4]$/.test(event.key) ? {type:'answer', choice:Number(event.key) - 1} : null;
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

export function orient(card, swapped) { return swapped ? { question: card.back, answer: card.front } : { question: card.front, answer: card.back }; }
export function answerPool(cards, swapped) {
  const unique = new Map();
  for (const card of cards) { const answer = orient(card, swapped).answer; if (!unique.has(answerKey(answer))) unique.set(answerKey(answer), answer); }
  return [...unique.values()];
}
export function makeQuestion(cards, index, swapped, random = Math.random, pool = answerPool(cards, swapped)) {
  const { question, answer } = orient(cards[index], swapped);
  const distractors = pool.filter(a => answerKey(a) !== answerKey(answer));
  if (distractors.length < 3) throw new Error('Insufficient flashcards. Try a different deck.');
  const choices = shuffle([answer, ...shuffle(distractors, random).slice(0, 3)], random);
  return { question, answer, choices, correct: choices.indexOf(answer) };
}
export function createSession(cards, swapped, indices = cards.map((_, i) => i), random = Math.random, shuffled = false) {
  return { order: shuffled ? shuffle(indices, random) : [...indices].sort((a, b) => a - b), position: 0, answers: [], swapped, cardCount: indices.length };
}
export function recordAnswer(session, question, choice) {
  if (!Number.isInteger(choice) || choice < 0 || choice > 3 || session.answers.length !== session.position || session.position >= session.order.length) return false;
  const index = session.order[session.position], correct = choice === question.correct;
  session.answers.push({ index, choice, correct });
  if (!correct) {
    // Revisit after four upcoming cards, or at the end if fewer remain.
    session.order.splice(Math.min(session.position + 5, session.order.length), 0, index);
  }
  return true;
}
export function score(session) {
  const correct = session.answers.filter(a => a.correct).length;
  return { correct, wrong: session.answers.length - correct, answered: session.answers.length, total: session.order.length };
}
