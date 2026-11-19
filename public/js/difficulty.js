function selectDifficulty(level) {
  sessionStorage.setItem('botDifficulty', level);
  location.href = 'select_character.html'; // Redirige a selección de personaje
}