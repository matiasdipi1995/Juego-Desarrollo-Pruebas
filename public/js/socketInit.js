// public/js/socketInit.js
const URL_SERVER = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://juego-desarrollo-pruebas.onrender.com';

window.socket = io(URL_SERVER, {
  transports: ['websocket', 'polling'],
  autoConnect: true
});