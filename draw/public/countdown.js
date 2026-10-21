// Hero countdown to tee-off (11h00 SAST, 23 October 2026).
(() => {
  const arrival = Date.parse('2026-10-23T11:00:00+02:00');
  const end = Date.parse('2026-10-24T00:00:00+02:00');
  const units = ['days', 'hours', 'minutes', 'seconds'];
  let interval;
  function update() {
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((arrival - now) / 1000));
    const values = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
    units.forEach((unit, index) => { document.getElementById(unit).textContent = String(values[index]).padStart(2, '0'); });
    if (now >= arrival) {
      document.getElementById('countdown-label').textContent = now < end ? 'GOLF DAY IS HERE · WELCOME TO AMANZIMTOTI' : 'THANK YOU FOR BEING PART OF OUR GOLF DAY';
      document.querySelector('.countdown').hidden = true;
      if (now >= end) clearInterval(interval);
    }
  }
  interval = setInterval(update, 1000);
  update();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
})();
