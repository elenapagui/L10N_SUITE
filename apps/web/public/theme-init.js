// Aplica el tema guardado antes de pintar la interfaz (evita el destello claro/oscuro).
(function () {
  try {
    var theme = localStorage.getItem('l10n-theme') || 'system';
    var dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
