let selectedP1 = null;
let selectedP2 = null;
let currentTurn = 1; // 1 para P1, 2 para P2
let tempSelection = null;

function pickCharacter(charType) {
  tempSelection = charType;

  // Remueve la clase 'selected' de todas las tarjetas
  document.querySelectorAll('.char-card').forEach(card => card.classList.remove('selected'));

  // Resalta la tarjeta seleccionada
  const activeCard = document.getElementById(`card-${charType}`);
  if (activeCard) activeCard.classList.add('selected');

  // Habilita el botón
  const btn = document.getElementById('btn-start-fight');
  if (btn) btn.disabled = false;
}

function confirmSelection() {
  if (!tempSelection) return;

  const title = document.getElementById('select-turn-title');
  const btn = document.getElementById('btn-start-fight');

  if (currentTurn === 1) {
    selectedP1 = tempSelection;
    tempSelection = null;
    currentTurn = 2;

    // Actualiza la interfaz para que el Jugador 2 elija
    if (title) {
      title.innerText = "Jugador 2: Elige tu Personaje";
      title.style.color = "#4488ff";
    }
    if (btn) {
      btn.innerText = "¡A Pelear!";
      btn.disabled = true;
    }

    // Limpia la selección visual
    document.querySelectorAll('.char-card').forEach(card => card.classList.remove('selected'));

  } else if (currentTurn === 2) {
    selectedP2 = tempSelection;

    // Redirige a la pantalla del juego enviando las selecciones en la URL (Query String)
    window.location.href = `local_game.html?p1=${selectedP1}&p2=${selectedP2}`;
  }
}