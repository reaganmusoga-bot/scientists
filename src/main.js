import "./firebase.js";
import "./app.js";

// Tell app.js that Firebase has been initialized
window.dispatchEvent(new Event("firebase-ready"));
