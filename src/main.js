import { scenario } from './data/escapeRoomScenario.js';

const app = document.querySelector('#app');
const totalSeconds = scenario.timeLimitMinutes * 60;

const state = {
  secondsLeft: totalSeconds,
  timerId: null,
  attempts: Object.fromEntries(scenario.puzzles.map((puzzle) => [puzzle.id, ''])),
  solved: [],
  inventory: [],
  message: '봉투를 열고 첫 단서를 확인하세요.',
};

const formatTime = (seconds) => {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remainingSeconds = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

const getVisiblePuzzles = () =>
  scenario.puzzles.filter((puzzle, index) => index === 0 || state.solved.includes(scenario.puzzles[index - 1].id));

const getCurrentStage = () => {
  if (state.solved.includes('final')) return '탈출 성공';
  const next = scenario.puzzles.find((puzzle) => !state.solved.includes(puzzle.id));
  return next ? next.title : '모든 퍼즐 완료';
};

const getActiveHints = () =>
  scenario.timedHints.filter((hint) => state.secondsLeft / 60 <= hint.thresholdMinutesLeft);

const stopTimer = () => {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
};

const startTimer = () => {
  if (state.timerId || state.solved.includes('final') || state.secondsLeft === 0) {
    return;
  }

  state.message = '타이머가 시작되었습니다. 방 안의 시계와 서재를 관찰하세요.';
  state.timerId = window.setInterval(() => {
    if (state.secondsLeft > 0) {
      state.secondsLeft -= 1;
    }

    if (state.secondsLeft === 0 || state.solved.includes('final')) {
      stopTimer();
    }

    render();
  }, 1000);

  render();
};

const resetGame = () => {
  stopTimer();
  state.secondsLeft = totalSeconds;
  state.attempts = Object.fromEntries(scenario.puzzles.map((puzzle) => [puzzle.id, '']));
  state.solved = [];
  state.inventory = [];
  state.message = '게임이 초기화되었습니다. 봉투를 다시 열어 시작하세요.';
  render();
};

const submitPuzzle = (puzzleId) => {
  const puzzle = scenario.puzzles.find((item) => item.id === puzzleId);
  const value = state.attempts[puzzleId].trim();

  if (!puzzle || state.solved.includes(puzzleId)) {
    return;
  }

  if (puzzleId === 'final' && state.solved.length < 3) {
    state.message = '최종 퍼즐을 열기 전에 앞선 세 개의 퍼즐을 모두 해결해야 합니다.';
    render();
    return;
  }

  if (value !== puzzle.answer) {
    state.message = `정답이 아닙니다. ${puzzle.title} 단서를 다시 확인해 보세요.`;
    render();
    return;
  }

  state.solved.push(puzzleId);
  state.inventory.push(puzzle.reward);
  state.message = puzzle.successMessage;

  if (puzzleId === 'final') {
    stopTimer();
  }

  render();
};

const render = () => {
  const escapeSucceeded = state.solved.includes('final');
  const timeExpired = state.secondsLeft === 0 && !escapeSucceeded;
  const hints = getActiveHints();
  const visiblePuzzles = getVisiblePuzzles();

  app.innerHTML = `
    <div class="app-shell">
      <header class="hero-card">
        <div>
          <p class="eyebrow">1시간 방탈출 웹앱</p>
          <h1>${scenario.title}</h1>
          <p class="subtitle">${scenario.subtitle}</p>
        </div>
        <div class="timer-panel">
          <span>남은 시간</span>
          <strong>${formatTime(state.secondsLeft)}</strong>
          <div class="timer-actions">
            <button id="startButton" ${state.timerId || escapeSucceeded || timeExpired ? 'disabled' : ''}>시작</button>
            <button class="secondary" id="resetButton">다시 시작</button>
          </div>
        </div>
      </header>

      <main class="layout-grid">
        <section class="panel story-panel">
          <h2>스토리</h2>
          <p>${scenario.introduction}</p>
          <div class="callout">
            <strong>시작 단서</strong>
            <p>${scenario.openingClue}</p>
          </div>
          <div class="callout bonus">
            <strong>보너스 연출</strong>
            <p>${scenario.bonusHint}</p>
          </div>
        </section>

        <section class="panel status-panel">
          <h2>진행 현황</h2>
          <ul class="status-list">
            <li><span>현재 단계</span><strong>${getCurrentStage()}</strong></li>
            <li><span>해결한 퍼즐</span><strong>${state.solved.length} / ${scenario.puzzles.length}</strong></li>
            <li><span>상태 메시지</span><strong>${state.message}</strong></li>
          </ul>
        </section>

        <section class="panel inventory-panel">
          <h2>인벤토리</h2>
          ${state.inventory.length === 0 ? '<p>아직 획득한 단서가 없습니다.</p>' : `<ul class="inventory-list">${state.inventory.map((item) => `<li>${item}</li>`).join('')}</ul>`}
        </section>

        <section class="panel timeline-panel">
          <h2>60분 진행표</h2>
          <div class="timeline-list">
            ${scenario.timeline
              .map(
                (item) => `
                  <article class="timeline-item">
                    <span>${item.range}</span>
                    <h3>${item.stage}</h3>
                    <p>${item.description}</p>
                  </article>`,
              )
              .join('')}
          </div>
        </section>

        <section class="panel hints-panel">
          <h2>타이머 기반 힌트</h2>
          ${
            hints.length === 0
              ? '<p>힌트는 시간이 흐르면 순차적으로 공개됩니다.</p>'
              : `<ul class="hint-list">${hints
                  .map(
                    (hint) => `<li><strong>${hint.title}</strong><p>${hint.description}</p></li>`,
                  )
                  .join('')}</ul>`
          }
        </section>

        <section class="panel puzzles-panel">
          <h2>퍼즐 진행</h2>
          <div class="puzzle-list">
            ${visiblePuzzles
              .map((puzzle) => {
                const solved = state.solved.includes(puzzle.id);
                const finalLocked = puzzle.id === 'final' && state.solved.length < 3;
                return `
                  <article class="puzzle-card ${solved ? 'solved' : ''}">
                    <div class="puzzle-header">
                      <div>
                        <p class="puzzle-step">STEP ${puzzle.step}</p>
                        <h3>${puzzle.title}</h3>
                      </div>
                      ${solved ? '<span class="badge">해결 완료</span>' : ''}
                    </div>
                    <p><strong>위치:</strong> ${puzzle.location}</p>
                    <p><strong>목표:</strong> ${puzzle.objective}</p>
                    <div class="clue-box">
                      <strong>단서</strong>
                      <ul>${puzzle.clues.map((clue) => `<li>${clue}</li>`).join('')}</ul>
                    </div>
                    <p class="team-hint"><strong>팀워크 포인트:</strong> ${puzzle.teamHint}</p>
                    <label>
                      ${puzzle.inputLabel}
                      <input data-puzzle-input="${puzzle.id}" value="${state.attempts[puzzle.id]}" placeholder="${puzzle.placeholder}" ${solved || finalLocked ? 'disabled' : ''} />
                    </label>
                    <button class="solve-button" data-solve="${puzzle.id}" ${solved || finalLocked ? 'disabled' : ''}>정답 확인</button>
                    <p class="reward-text"><strong>보상:</strong> ${puzzle.reward}</p>
                  </article>`;
              })
              .join('')}
          </div>
        </section>

        <section class="panel finale-panel">
          <h2>엔딩</h2>
          ${
            escapeSucceeded
              ? '<div class="ending success"><strong>탈출 성공!</strong><p>사라진 시간을 되찾고 시간의 문을 열었습니다.</p></div>'
              : timeExpired
                ? '<div class="ending fail"><strong>시간 초과</strong><p>초침이 멈췄습니다. 다시 시작해 더 빠르게 단서를 조합해 보세요.</p></div>'
                : '<div class="ending neutral"><strong>아직 탈출 전</strong><p>모든 단서를 모아 마지막 자물쇠를 열어야 합니다.</p></div>'
          }
        </section>
      </main>
    </div>
  `;

  document.querySelector('#startButton')?.addEventListener('click', startTimer);
  document.querySelector('#resetButton')?.addEventListener('click', resetGame);

  document.querySelectorAll('[data-puzzle-input]').forEach((input) => {
    input.addEventListener('input', (event) => {
      state.attempts[event.target.dataset.puzzleInput] = event.target.value;
    });
  });

  document.querySelectorAll('[data-solve]').forEach((button) => {
    button.addEventListener('click', (event) => submitPuzzle(event.target.dataset.solve));
  });
};

render();
