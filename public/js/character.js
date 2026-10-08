//  ACTUALICÉ LA LÓGICA PARA QUE NO ELIJA SÓLO ENTRE GUERRERO O MAGO AL INICIAR, SE PODRÁ SELECCIONAR ALEATORIAMENTE LA CLASE O POR DESCARTE

let selectedCharacter = null;

function selectPlayerChar(charType) {
  selectedCharacter = charType;

  // Quitar selección previa de todas las tarjetas
  document.getElementById('card-warrior')?.classList.remove('selected');
  document.getElementById('card-mage')?.classList.remove('selected');
  document.getElementById('card-archer')?.classList.remove('selected');

  // Marcar la seleccionada
  const selectedCard = document.getElementById(`card-${charType}`);
  if (selectedCard) selectedCard.classList.add('selected');

  // Habilitar botón
  const startBtn = document.getElementById('btn-start-fight');
  if (startBtn) startBtn.disabled = false;
}

function confirmSelection() {
  if (!selectedCharacter) return;

  sessionStorage.setItem('playerChar', selectedCharacter);

  // Lista de clases disponibles
  const availableChars = ['warrior', 'mage', 'archer'];
  
  // Filtrar las que NO eligió el jugador para asignarle una al bot
  const botOptions = availableChars.filter(c => c !== selectedCharacter);
  const randomBotChar = botOptions[Math.floor(Math.random() * botOptions.length)];

  sessionStorage.setItem('botChar', randomBotChar);

  location.href = 'bot_game.html';
}