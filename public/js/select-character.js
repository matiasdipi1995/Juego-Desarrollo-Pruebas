// public/js/select-character.js
const params = new URLSearchParams(window.location.search);
const gameMode = params.get('mode') === 'local' ? 'local' : 'bot';

const characterList = ['warrior', 'mage', 'archer', 'ninja'];
const displayNames = { warrior: 'GUERRERO', mage: 'MAGO', archer: 'ARQUERO', ninja: 'NINJA' };

let p1Index = 0;
let p2Index = 1;
let selectedP1 = null;
let selectedP2 = null;

const cardEl = document.getElementById('selection-card');
const titleEl = document.getElementById('main-title');
const p2Block = document.getElementById('p2-block');

if (gameMode === 'local') {
  titleEl.textContent = 'Selección Local 1 vs 1';
  p2Block.style.display = 'block';
} else {
  titleEl.textContent = '1 vs Máquina: Elige tu Personaje';
  cardEl.classList.add('bot-mode');
  p2Block.style.display = 'none';
}

function updateP1Highlight() {
  document.querySelectorAll('.p1-card').forEach(c => c.classList.remove('highlight', 'selected'));
  const current = characterList[p1Index];
  if (selectedP1) {
    document.getElementById(`p1-card-${selectedP1}`).classList.add('selected');
  } else {
    document.getElementById(`p1-card-${current}`).classList.add('highlight');
    document.getElementById('p1-selected-name').innerText = displayNames[current];
  }
}

function updateP2Highlight() {
  if (gameMode !== 'local') return;
  document.querySelectorAll('.p2-card').forEach(c => c.classList.remove('highlight', 'selected'));
  const current = characterList[p2Index];
  if (selectedP2) {
    document.getElementById(`p2-card-${selectedP2}`).classList.add('selected');
  } else {
    document.getElementById(`p2-card-${current}`).classList.add('highlight');
    document.getElementById('p2-selected-name').innerText = displayNames[current];
  }
}

function selectP1Index(index) {
  p1Index = index;
  selectedP1 = characterList[p1Index];
  document.getElementById('p1-selected-name').innerText = displayNames[selectedP1] + ' (LISTO)';
  updateP1Highlight();
  checkCanStart();
}

function selectP2Index(index) {
  if (gameMode !== 'local') return;
  p2Index = index;
  selectedP2 = characterList[p2Index];
  document.getElementById('p2-selected-name').innerText = displayNames[selectedP2] + ' (LISTO)';
  updateP2Highlight();
  checkCanStart();
}

function checkCanStart() {
  const btn = document.getElementById('btn-start-fight');
  btn.disabled = gameMode === 'local' ? !(selectedP1 && selectedP2) : !selectedP1;
}

function confirmSelection() {
  if (gameMode === 'local') {
    if (selectedP1 && selectedP2) {
      window.location.href = `local_game.html?p1=${selectedP1}&p2=${selectedP2}`;
    }
  } else if (selectedP1) {
    sessionStorage.setItem('playerChar', selectedP1);
    const botOptions = characterList.filter(c => c !== selectedP1);
    const randomBotChar = botOptions[Math.floor(Math.random() * botOptions.length)];
    sessionStorage.setItem('botChar', randomBotChar);
    window.location.href = 'bot_game.html';
  }
}

function goBack() {
  window.location.href = gameMode === 'local' ? 'index.html' : 'select_difficulty.html';
}

window.addEventListener('keydown', (e) => {
  if (!selectedP1) {
    if (e.code === 'KeyA' || (gameMode === 'bot' && e.code === 'ArrowLeft')) {
      p1Index = (p1Index - 1 + characterList.length) % characterList.length;
      updateP1Highlight();
      return;
    } else if (e.code === 'KeyD' || (gameMode === 'bot' && e.code === 'ArrowRight')) {
      p1Index = (p1Index + 1) % characterList.length;
      updateP1Highlight();
      return;
    } else if (e.code === 'Space' || (gameMode === 'bot' && e.code === 'Enter')) {
      e.preventDefault();
      selectP1Index(p1Index);
      return;
    }
  }

  if (gameMode === 'local' && !selectedP2) {
    if (e.code === 'ArrowLeft') {
      p2Index = (p2Index - 1 + characterList.length) % characterList.length;
      updateP2Highlight();
      return;
    } else if (e.code === 'ArrowRight') {
      p2Index = (p2Index + 1) % characterList.length;
      updateP2Highlight();
      return;
    } else if (e.code === 'Enter') {
      e.preventDefault();
      selectP2Index(p2Index);
      return;
    }
  }

  const ready = gameMode === 'local' ? (selectedP1 && selectedP2) : !!selectedP1;
  if (ready && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    confirmSelection();
  }
});

updateP1Highlight();
updateP2Highlight();