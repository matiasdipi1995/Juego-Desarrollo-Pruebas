let selectedCharacter = null;

function selectPlayerChar(charType) {
  selectedCharacter = charType;

  // Actualizar estilos visuales de selección
  document.getElementById('card-warrior').classList.remove('selected');
  document.getElementById('card-mage').classList.remove('selected');

  document.getElementById(`card-${charType}`).classList.add('selected');

  // Habilitar botón de pelear
  document.getElementById('btn-start-fight').disabled = false;
}

function confirmSelection() {
  if (!selectedCharacter) return;

  // Guardar personaje del usuario
  sessionStorage.setItem('playerChar', selectedCharacter);

  // El bot tomará automáticamente el personaje contrario
  const botChar = selectedCharacter === 'warrior' ? 'mage' : 'warrior';
  sessionStorage.setItem('botChar', botChar);

  location.href = 'bot_game.html';
}