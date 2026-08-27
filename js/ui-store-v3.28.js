(function(){
  const STORAGE_KEY = 'jk_theme_mode';
  const DARK = 'dark';
  const LIGHT = 'light';

  function applyTheme(mode){
    const root = document.documentElement;
    if(mode === DARK) root.setAttribute('data-jk-theme', DARK);
    else root.removeAttribute('data-jk-theme');
    updateButton(mode);
  }

  function currentTheme(){
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved === DARK || saved === LIGHT) return saved;
    return LIGHT;
  }

  function nextTheme(mode){
    return mode === DARK ? LIGHT : DARK;
  }

  function buttonLabel(mode){
    return mode === DARK ? '☀️ โหมดสว่าง' : '🌙 โหมดมืด';
  }

  function updateButton(mode){
    const btn = document.getElementById('jk28ThemeToggle');
    if(!btn) return;
    btn.setAttribute('data-theme-mode', mode);
    btn.innerHTML = '<span class="jk28-theme-dot"></span><span>' + buttonLabel(mode) + '</span>';
    btn.setAttribute('aria-label', buttonLabel(mode));
    btn.setAttribute('title', buttonLabel(mode));
  }

  function onToggle(){
    const mode = currentTheme();
    const changed = nextTheme(mode);
    localStorage.setItem(STORAGE_KEY, changed);
    applyTheme(changed);
  }

  function ensureButton(){
    if(document.getElementById('jk28ThemeToggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'jk28ThemeToggle';
    button.className = 'outline-btn no-print';
    button.addEventListener('click', onToggle);

    const userBox = document.querySelector('.topbar .user-box');
    if(userBox){
      userBox.insertBefore(button, userBox.firstChild);
    } else {
      const topbar = document.querySelector('.topbar');
      if(topbar) topbar.appendChild(button);
    }
    updateButton(currentTheme());
  }

  function init(){
    ensureButton();
    applyTheme(currentTheme());
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
