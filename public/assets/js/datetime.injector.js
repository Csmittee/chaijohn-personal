/* datetime.injector.js — global top bar clock
   Auto-detects local timezone. Updates every minute.
   No panelactivated — fires on DOMContentLoaded. */

(function () {
  function render() {
    const el = document.getElementById('tm-datetime-display');
    if (!el) return;

    const now = new Date();
    const tz  = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const datePart = now.toLocaleDateString('en-GB', {
      timeZone: tz,
      weekday: 'short',
      day:     'numeric',
      month:   'short'
    }); // e.g. "Wed, 4 Jun"

    const timePart = now.toLocaleTimeString('en-GB', {
      timeZone: tz,
      hour:   '2-digit',
      minute: '2-digit',
      hour12: false
    }); // e.g. "17:34"

    el.textContent = datePart + ' · ' + timePart;
    el.title = 'Local time (' + tz + ')';
  }

  function start() {
    render();
    // Align tick to next full minute for accuracy
    const now    = new Date();
    const msLeft = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(function () {
      render();
      setInterval(render, 60000);
    }, msLeft);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
