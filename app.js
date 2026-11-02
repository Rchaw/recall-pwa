import {parseDeckCSV, quizKeyAction, orient, answerPool, makeQuestion, createSession, recordAnswer, score} from './core.js';

const $ = id => document.getElementById(id);
// Only one deck lives in memory. Reloading or ending the session discards it.
let currentDeck = null, mode = 'review', order = [], position = 0, flipped = false, quizShuffled = false;
let reviewed = new Set(), advanceTimer = null;
let session = null, question = null, pool = [], confirmAction = null;
function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); $('notice').setAttribute('role', error ? 'alert' : 'status'); $('notice').hidden = !text; }
function selected() { return currentDeck; }
function load() { resetStudy(); render(); }
function endSession() {
  currentDeck = null; mode = 'review'; quizShuffled = false; $('quiz-shuffle').checked = false; resetStudy(); notice('');
  for (const id of ['card-text','question-text','progress']) $(id).textContent = '';
  $('choices').replaceChildren(); $('missed-list').replaceChildren();
  $('flashcard').setAttribute('aria-label', 'Flip card');
  $('empty-import').textContent = 'Import CSV';
  render();
}
function resetStudy() { clearTimeout(advanceTimer); advanceTimer = null; order = selected()?.cards.map((_, i) => i) ?? []; position = 0; flipped = false; reviewed = new Set(); session = null; question = null; pool = []; }
function confirmChange(title, text, action, label = 'Continue') {
  $('confirm-title').textContent = title; $('confirm-text').textContent = text; $('accept-confirm').textContent = label; confirmAction = action; $('confirm-dialog').showModal(); $('cancel-confirm').focus();
}
function guardSession(action) {
  if (session && session.answers.length > 0 && session.position < session.order.length) confirmChange('Leave this practice session?', 'Your answers for this unfinished practice run will be cleared.', action, 'Leave session');
  else action();
}
$('accept-confirm').onclick = () => { const action = confirmAction; confirmAction = null; $('confirm-dialog').close(); action?.(); };
$('cancel-confirm').onclick = () => { confirmAction = null; $('confirm-dialog').close(); };
$('confirm-dialog').addEventListener('cancel', () => { confirmAction = null; });

function render() {
  const deck = selected();
  $('empty-state').hidden = !!deck; $('deck-panel').hidden = !deck;
  if (!deck) return;
  $('swap').checked = deck.swapped;
  $('review-mode').setAttribute('aria-pressed', String(mode === 'review'));
  $('quiz-mode').setAttribute('aria-pressed', String(mode === 'quiz'));
  $('review-view').hidden = mode !== 'review'; $('quiz-view').hidden = mode !== 'quiz';
  $('review-controls').hidden = mode !== 'review'; $('quiz-order-control').hidden = mode !== 'quiz';
  if (mode === 'review') renderReview(); else renderQuiz();
}
function renderReview() {
  const deck = selected(), card = deck.cards[order[position]], side = orient(card, deck.swapped);
  reviewed.add(order[position]);
  $('progress').textContent = `${reviewed.size}/${deck.cards.length}`;
  $('progress').setAttribute('aria-label', `${reviewed.size} reviewed, ${deck.cards.length} total cards`);
  const cardSide = flipped ? (deck.swapped ? 'FRONT' : 'BACK') : (deck.swapped ? 'BACK' : 'FRONT');
  $('card-text').textContent = flipped ? side.answer : side.question;
  $('flashcard').classList.toggle('flipped', flipped);
  $('flashcard').setAttribute('aria-label', `${cardSide}: ${$('card-text').textContent}. Flip card.`);
  $('previous').disabled = position === 0; $('next').disabled = position === order.length - 1;
}
function moveCard(delta) { if (position + delta < 0 || position + delta >= order.length) return; position += delta; flipped = false; renderReview(); }
function flipCard() { flipped = !flipped; renderReview(); }
$('flashcard').onclick = flipCard; $('flip').onclick = flipCard;
$('previous').onclick = () => moveCard(-1); $('next').onclick = () => moveCard(1);
$('review-mode').onclick = () => { if (mode === 'review') return; guardSession(() => { mode = 'review'; resetStudy(); render(); }); };
$('quiz-mode').onclick = () => { if (mode === 'quiz') return; mode = 'quiz'; render(); };
$('quiz-shuffle').onchange = () => {
  const value = $('quiz-shuffle').checked; $('quiz-shuffle').checked = quizShuffled;
  guardSession(() => { quizShuffled = value; $('quiz-shuffle').checked = value; resetStudy(); render(); });
};
$('swap').onchange = () => {
  const value = $('swap').checked; $('swap').checked = selected().swapped;
  guardSession(() => { selected().swapped = value; resetStudy(); render(); });
};

function startQuiz(indices) {
  clearTimeout(advanceTimer); advanceTimer = null;
  const deck = selected(); pool = answerPool(deck.cards, deck.swapped);
  session = createSession(deck.cards, deck.swapped, indices, Math.random, quizShuffled);
  question = makeQuestion(deck.cards, session.order[0], deck.swapped, Math.random, pool);
}
function renderQuiz() {
  const deck = selected();
  if (!pool.length) pool = answerPool(deck.cards, deck.swapped);
  $('quiz-active').hidden = false; $('quiz-results').hidden = true;
  if (!session) startQuiz();
  if (session.position === session.order.length) { renderResults(); return; }
  const summary = score(session), answered = session.answers.length > session.position, result = session.answers[session.position];
  $('progress').textContent = `${summary.correct}/${deck.cards.length}`;
  $('progress').setAttribute('aria-label', `${summary.correct} cleared, ${deck.cards.length} total cards`);
  $('question-text').textContent = question.question;
  $('choices').replaceChildren();
  question.choices.forEach((answer, index) => {
    const b = document.createElement('button'); b.className = 'choice';
    const label = document.createElement('span'); label.className = 'number'; label.textContent = 'ABCD'[index]; label.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.className = 'answer-text'; text.textContent = answer;
    b.setAttribute('aria-label', `${'ABCD'[index]}: ${answer}`);
    b.append(label, text);
    if (answered) {
      const correct = index === question.correct, wrong = index === result.choice && !correct;
      b.classList.add(correct ? 'correct' : wrong ? 'wrong' : 'dimmed');
      if (correct || wrong) { const mark = document.createElement('span'); mark.className = 'mark'; mark.textContent = correct ? '✓' : '✕'; mark.setAttribute('aria-label',correct ? 'Correct answer' : 'Your incorrect answer'); b.append(mark); }
    }
    b.onclick = answered ? (result.correct ? null : nextQuestion) : () => answerQuestion(index); $('choices').append(b);
  });
}
function answerQuestion(index) {
  if (!session || !question || !recordAnswer(session, question, index)) return;
  renderQuiz(); $('question-text').focus({preventScroll:true});
  if (session.answers[session.position].correct) {
    const answeredSession = session, answeredPosition = session.position;
    const advanceWhenReady = () => {
      if (session !== answeredSession || mode !== 'quiz' || session.position !== answeredPosition) return;
      if (document.querySelector('dialog[open]')) { advanceTimer = setTimeout(advanceWhenReady, 100); return; }
      advanceTimer = null; nextQuestion();
    };
    advanceTimer = setTimeout(advanceWhenReady, 800);
  }
}
function nextQuestion() {
  if (!session || session.answers.length <= session.position) return;
  session.position++;
  if (session.position < session.order.length) question = makeQuestion(selected().cards, session.order[session.position], selected().swapped, Math.random, pool);
  renderQuiz(); (session.position < session.order.length ? $('question-text') : $('practice-again')).focus({preventScroll:true});
}
function renderResults() {
  $('quiz-active').hidden = true; $('quiz-results').hidden = false;
  const summary = score(session), deck = selected();
  $('progress').textContent = `${summary.correct}/${deck.cards.length}`;
  $('progress').setAttribute('aria-label', `${summary.correct} cleared, ${deck.cards.length} total cards`);
  const missed = [...new Set(session.answers.filter(answer => !answer.correct).map(answer => answer.index))];
  $('retry-missed').hidden = missed.length === 0;
  $('missed-list').replaceChildren();
  for (const index of missed) {
    const card = orient(deck.cards[index], deck.swapped);
    const item = document.createElement('div'), title = document.createElement('strong'), text = document.createElement('p');
    item.className = 'missed-item'; title.textContent = card.question; text.textContent = card.answer;
    item.append(title, text); $('missed-list').append(item);
  }
}
$('practice-again').onclick = () => { startQuiz(); renderQuiz(); $('question-text').focus(); };
$('retry-missed').onclick = () => {
  const missed = [...new Set(session.answers.filter(answer => !answer.correct).map(answer => answer.index))];
  startQuiz(missed); renderQuiz(); $('question-text').focus();
};
$('end-session').onclick = () => confirmChange('End this session?', 'This deck and its results will be discarded. Import the CSV again whenever you want to study it.', endSession, 'End session');
function importFile() { guardSession(() => $('file-input').click()); }
$('empty-import').onclick = importFile;
$('file-input').onchange = async () => {
  const file = $('file-input').files[0]; $('file-input').value = ''; if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Choose a CSV smaller than 5 MB.');
    const cards = parseDeckCSV(await file.text());
    currentDeck = {name:file.name.replace(/\.csv$/i,'') || 'Untitled deck', cards, swapped:false};
    resetStudy(); mode = 'review'; quizShuffled = false; $('quiz-shuffle').checked = false;
    notice('');
    render();
  } catch (error) {
    endSession();
    notice(error.message || 'That file could not be imported. Please use a UTF-8 CSV.', true);
    $('empty-import').textContent = 'Choose a different CSV';
    $('empty-import').focus();
  }
};

window.addEventListener('keydown', event => {
  if (event.repeat || event.isComposing || document.querySelector('dialog[open]') || !selected()) return;
  if (event.target instanceof Element) {
    const field = event.target.closest('input,textarea,select');
    // Switches retain focus after use, but study shortcuts should still work.
    if (field && !(field.tagName === 'INPUT' && (field.type === 'checkbox' || field.type === 'radio'))) return;
    if (event.target.isContentEditable) return;
  }
  if (mode === 'review') {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); if (event.key === 'ArrowLeft') moveCard(-1); else if (event.key === 'ArrowRight') moveCard(1); else flipCard();
    }
  } else {
    const action = quizKeyAction(session, event);
    if (!action) return;
    event.preventDefault();
    if (action.type === 'continue') nextQuestion();
    else answerQuestion(action.choice);
  }
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
$('theme-toggle').onclick = () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-toggle').textContent = dark ? 'Light' : 'Dark';
  $('theme-toggle').setAttribute('aria-pressed', String(dark));
  $('theme-toggle').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
};
let textSize = 200;
function applyTextSize() {
  document.documentElement.style.setProperty('--study-size', `${textSize / 100}`);
  $('text-smaller').disabled = textSize <= 120;
  $('text-larger').disabled = textSize >= 360;
}
$('text-smaller').onclick = () => { textSize = Math.max(120, textSize - 20); applyTextSize(); };
$('text-larger').onclick = () => { textSize = Math.min(360, textSize + 20); applyTextSize(); };
applyTextSize();
load();
