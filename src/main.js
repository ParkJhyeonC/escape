import { scenario } from './data/escapeRoomScenario.js';

const app = document.querySelector('#app');
const totalSeconds = scenario.timeLimitMinutes * 60;

const initialAttempts = Object.fromEntries(scenario.puzzles.map((puzzle) => [puzzle.id, '']));
const initialHints = Object.fromEntries(scenario.puzzles.map((puzzle) => [puzzle.id, 0]));

const state = {
  secondsLeft: totalSeconds,
  timerId: null,
  attempts: { ...initialAttempts },
  solved: [],
  inventory: [],
  inspectedObjects: [],
  journal: [],
  message: '게임을 시작하고 입구의 봉투부터 조사해 보세요.',
  hintsUsed: { ...initialHints },
};

const formatTime = (seconds) => {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remainingSeconds = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

const getPuzzle = (puzzleId) => scenario.puzzles.find((puzzle) => puzzle.id === puzzleId);
const getRoom = (roomId) => scenario.rooms.find((room) => room.id === roomId);
const isSolved = (puzzleId) => state.solved.includes(puzzleId);

const isRoomUnlocked = (room) => !room.unlockedBy || isSolved(room.unlockedBy);

const getCurrentStage = () => {
  if (isSolved('final')) {
    return '탈출 성공';
  }

  const nextPuzzle = scenario.puzzles.find((puzzle) => !isSolved(puzzle.id));
  return nextPuzzle ? nextPuzzle.title : '모든 퍼즐 완료';
};

const getAutoHints = () =>
  scenario.timedHints.filter((hint) => state.secondsLeft / 60 <= hint.thresholdMinutesLeft);

const getDiscoveredClues = (puzzle) =>
  puzzle.requiredObjects
    .filter((objectId) => state.inspectedObjects.includes(objectId))
    .map((objectId) => {
      const room = scenario.rooms.find((entry) => entry.objects.some((object) => object.id === objectId));
      const object = room?.objects.find((entry) => entry.id === objectId);
      return object ? { roomTitle: room.title, title: object.title, discovery: object.discovery } : null;
    })
    .filter(Boolean);

const stopTimer = () => {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
};

const startTimer = () => {
  if (state.timerId || state.secondsLeft === 0 || isSolved('final')) {
    return;
  }

  state.message = '시간이 흐르기 시작했습니다. 주변 사물을 먼저 조사하세요.';
  state.timerId = window.setInterval(() => {
    if (state.secondsLeft > 0) {
      state.secondsLeft -= 1;
    }

    if (state.secondsLeft === 0 || isSolved('final')) {
      stopTimer();
    }

    render();
  }, 1000);

  render();
};

const resetGame = () => {
  stopTimer();
  state.secondsLeft = totalSeconds;
  state.attempts = { ...initialAttempts };
  state.solved = [];
  state.inventory = [];
  state.inspectedObjects = [];
  state.journal = [];
  state.message = '게임을 다시 시작했습니다. 이번에는 봉투와 시계부터 차근차근 살펴보세요.';
  state.hintsUsed = { ...initialHints };
  render();
};

const inspectObject = (objectId) => {
  if (state.inspectedObjects.includes(objectId)) {
    state.message = '이미 조사한 사물입니다. 기록을 다시 확인해 보세요.';
    render();
    return;
  }

  const room = scenario.rooms.find((entry) => entry.objects.some((object) => object.id === objectId));
  const object = room?.objects.find((entry) => entry.id === objectId);

  if (!room || !object) return;

  state.inspectedObjects.push(objectId);
  state.journal.unshift({
    roomTitle: room.title,
    objectTitle: object.title,
    discovery: object.discovery,
  });
  state.message = object.logMessage;
  render();
};

const useHint = (puzzleId) => {
  const puzzle = getPuzzle(puzzleId);
  if (!puzzle) return;

  const currentHintCount = state.hintsUsed[puzzleId];
  if (currentHintCount >= puzzle.hintSteps.length) {
    state.message = '이 퍼즐에서 더 이상 공개할 힌트가 없습니다.';
    render();
    return;
  }

  state.hintsUsed[puzzleId] += 1;
  state.message = `${puzzle.title}의 추가 힌트를 확인했습니다.`;
  render();
};

const submitPuzzle = (puzzleId) => {
  const puzzle = getPuzzle(puzzleId);
  if (!puzzle || isSolved(puzzleId)) {
    return;
  }

  const answer = state.attempts[puzzleId].trim();
  const discoveredClues = getDiscoveredClues(puzzle);
  if (discoveredClues.length < puzzle.requiredObjects.length) {
    state.message = '아직 이 퍼즐을 풀 만큼의 단서를 모두 찾지 못했습니다. 방을 더 조사해 보세요.';
    render();
    return;
  }

  if (answer !== puzzle.answer) {
    state.message = `${puzzle.title}의 입력이 틀렸습니다. 조사 기록과 힌트를 다시 조합해 보세요.`;
    render();
    return;
  }

  state.solved.push(puzzleId);
  state.inventory.push({ title: puzzle.successTitle, description: puzzle.successReward });
  state.message = puzzle.successMessage;

  if (puzzleId === 'final') {
    stopTimer();
  }

  render();
};

const visiblePuzzles = () => scenario.puzzles.filter((puzzle) => isRoomUnlocked(getRoom(puzzle.roomId)));

const render = () => {
  const autoHints = getAutoHints();
  const timeExpired = state.secondsLeft === 0 && !isSolved('final');

  app.innerHTML = `
    <div class="app-shell">
      <header class="hero-card">
        <div>
          <p class="eyebrow">Playable Escape Room</p>
          <h1>${scenario.title}</h1>
          <p class="subtitle">${scenario.subtitle}</p>
          <p class="hero-copy">${scenario.openingNarration}</p>
        </div>
        <div class="timer-panel">
          <span>남은 시간</span>
          <strong>${formatTime(state.secondsLeft)}</strong>
          <div class="timer-actions">
            <button id="startButton" ${state.timerId || timeExpired || isSolved('final') ? 'disabled' : ''}>게임 시작</button>
            <button class="secondary" id="resetButton">처음부터</button>
          </div>
        </div>
      </header>

      <main class="layout-grid">
        <section class="panel story-panel">
          <h2>게임 목표</h2>
          <p>${scenario.introduction}</p>
          <div class="callout">
            <strong>탈출 조건</strong>
            <p>${scenario.escapeGoal}</p>
          </div>
          <div class="callout bonus">
            <strong>현재 상태</strong>
            <p>${state.message}</p>
          </div>
        </section>

        <section class="panel status-panel">
          <h2>진행 현황</h2>
          <ul class="status-list">
            <li><span>현재 단계</span><strong>${getCurrentStage()}</strong></li>
            <li><span>조사한 사물</span><strong>${state.inspectedObjects.length}개</strong></li>
            <li><span>해결한 퍼즐</span><strong>${state.solved.length} / ${scenario.puzzles.length}</strong></li>
          </ul>
        </section>

        <section class="panel inventory-panel">
          <h2>획득 기록</h2>
          ${
            state.inventory.length === 0
              ? '<p>아직 해제된 장치나 획득한 기록이 없습니다.</p>'
              : `<ul class="inventory-list stacked">${state.inventory
                  .map((item) => `<li><strong>${item.title}</strong><span>${item.description}</span></li>`)
                  .join('')}</ul>`
          }
        </section>

        <section class="panel timeline-panel">
          <h2>권장 플레이 흐름</h2>
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

        <section class="panel journal-panel">
          <h2>조사 기록</h2>
          ${
            state.journal.length === 0
              ? '<p>아직 기록된 단서가 없습니다. 입구의 물건부터 조사해 보세요.</p>'
              : `<div class="journal-list">${state.journal
                  .map(
                    (entry) => `
                      <article class="journal-entry">
                        <span>${entry.roomTitle}</span>
                        <h3>${entry.objectTitle}</h3>
                        <p>${entry.discovery}</p>
                      </article>`,
                  )
                  .join('')}</div>`
          }
        </section>

        <section class="panel hints-panel">
          <h2>자동 힌트</h2>
          ${
            autoHints.length === 0
              ? '<p>자동 힌트는 시간이 흐르면 공개됩니다.</p>'
              : `<ul class="hint-list">${autoHints
                  .map((hint) => `<li><strong>${hint.title}</strong><p>${hint.description}</p></li>`)
                  .join('')}</ul>`
          }
        </section>

        <section class="panel rooms-panel">
          <h2>방 탐색</h2>
          <div class="room-grid">
            ${scenario.rooms
              .map((room) => {
                const unlocked = isRoomUnlocked(room);
                return `
                  <article class="room-card ${unlocked ? '' : 'locked'}">
                    <div class="room-card-header">
                      <div>
                        <p class="puzzle-step">AREA</p>
                        <h3>${room.title}</h3>
                      </div>
                      ${unlocked ? '<span class="badge">탐색 가능</span>' : '<span class="badge muted">잠김</span>'}
                    </div>
                    <p>${room.atmosphere}</p>
                    <div class="object-list">
                      ${room.objects
                        .map((object) => {
                          const inspected = state.inspectedObjects.includes(object.id);
                          return `
                            <button
                              class="object-button ${inspected ? 'inspected' : ''}"
                              data-inspect="${object.id}"
                              ${unlocked ? '' : 'disabled'}
                            >
                              <strong>${object.title}</strong>
                              <span>${inspected ? '조사 완료' : object.actionLabel}</span>
                            </button>`;
                        })
                        .join('')}
                    </div>
                  </article>`;
              })
              .join('')}
          </div>
        </section>

        <section class="panel puzzles-panel">
          <h2>퍼즐 풀이</h2>
          <div class="puzzle-list">
            ${visiblePuzzles()
              .map((puzzle) => {
                const clues = getDiscoveredClues(puzzle);
                const hintsToShow = puzzle.hintSteps.slice(0, state.hintsUsed[puzzle.id]);
                const solved = isSolved(puzzle.id);
                return `
                  <article class="puzzle-card ${solved ? 'solved' : ''}">
                    <div class="puzzle-header">
                      <div>
                        <p class="puzzle-step">STEP ${puzzle.step}</p>
                        <h3>${puzzle.title}</h3>
                      </div>
                      ${solved ? '<span class="badge">해결 완료</span>' : ''}
                    </div>
                    <p class="prompt">${puzzle.prompt}</p>
                    <div class="clue-box">
                      <strong>발견한 단서</strong>
                      ${
                        clues.length === 0
                          ? '<p class="empty-text">아직 이 퍼즐에 연결된 단서를 찾지 못했습니다.</p>'
                          : `<ul>${clues.map((clue) => `<li><strong>${clue.title}</strong>: ${clue.discovery}</li>`).join('')}</ul>`
                      }
                    </div>
                    <div class="clue-box subtle">
                      <strong>추가 힌트</strong>
                      ${
                        hintsToShow.length === 0
                          ? '<p class="empty-text">필요하면 힌트 버튼을 눌러 한 단계씩 공개하세요.</p>'
                          : `<ul>${hintsToShow.map((hint) => `<li>${hint}</li>`).join('')}</ul>`
                      }
                    </div>
                    <label>
                      답 입력
                      <input
                        data-puzzle-input="${puzzle.id}"
                        value="${state.attempts[puzzle.id]}"
                        placeholder="${puzzle.placeholder}"
                        ${solved ? 'disabled' : ''}
                      />
                    </label>
                    <div class="puzzle-actions">
                      <button class="secondary" data-hint="${puzzle.id}" ${solved ? 'disabled' : ''}>힌트 보기</button>
                      <button class="solve-button" data-solve="${puzzle.id}" ${solved ? 'disabled' : ''}>정답 확인</button>
                    </div>
                  </article>`;
              })
              .join('')}
          </div>
        </section>

        <section class="panel finale-panel">
          <h2>엔딩 상태</h2>
          ${
            isSolved('final')
              ? '<div class="ending success"><strong>탈출 성공!</strong><p>멈췄던 시계가 다시 움직이며 문이 열렸습니다.</p></div>'
              : timeExpired
                ? '<div class="ending fail"><strong>시간 초과</strong><p>단서는 남아 있지만 시간이 멈췄습니다. 처음부터 다시 도전해 보세요.</p></div>'
                : '<div class="ending neutral"><strong>플레이 중</strong><p>사물을 조사하고, 기록을 읽고, 스스로 조합해 퍼즐을 푸는 구조입니다.</p></div>'
          }
        </section>
      </main>
    </div>
  `;

  document.querySelector('#startButton')?.addEventListener('click', startTimer);
  document.querySelector('#resetButton')?.addEventListener('click', resetGame);

  document.querySelectorAll('[data-inspect]').forEach((button) => {
    button.addEventListener('click', (event) => inspectObject(event.currentTarget.dataset.inspect));
  });

  document.querySelectorAll('[data-puzzle-input]').forEach((input) => {
    input.addEventListener('input', (event) => {
      state.attempts[event.target.dataset.puzzleInput] = event.target.value;
    });
  });

  document.querySelectorAll('[data-hint]').forEach((button) => {
    button.addEventListener('click', (event) => useHint(event.currentTarget.dataset.hint));
  });

  document.querySelectorAll('[data-solve]').forEach((button) => {
    button.addEventListener('click', (event) => submitPuzzle(event.currentTarget.dataset.solve));
  });
};

render();
