(function () {
  var dbg = /[?&]debug/.test(location.search), errs = [];
  window.__skErr = errs;
  window.addEventListener('error', function (e) { errs.push((e.message || 'onbekende fout') + ' (regel ' + (e.lineno || '?') + ')'); });
  if (!dbg) return;
  function show() {
    var el = document.getElementById('dbg');
    if (!el) {
      el = document.createElement('pre'); el.id = 'dbg';
      el.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99;max-height:50vh;overflow:auto;margin:0;padding:12px;background:#000;color:#7f7;font:14px/1.45 monospace;white-space:pre-wrap;border:1px solid #7f7';
      document.body.appendChild(el);
    }
    var c = document.getElementById('fire'), s = document.getElementById('stage'), out = [];
    out.push('Browser: ' + navigator.userAgent);
    out.push('Venster: ' + window.innerWidth + 'x' + window.innerHeight + ', pixelratio ' + (window.devicePixelRatio || 1));
    out.push('ResizeObserver: ' + (window.ResizeObserver ? 'ja' : 'nee') + ', CSS.supports: ' + (window.CSS && CSS.supports ? 'ja' : 'nee'));
    if (s) { var rs = s.getBoundingClientRect(); out.push('Kamer: ' + Math.round(rs.width) + 'x' + Math.round(rs.height)); }
    if (c) { var r = c.getBoundingClientRect(); out.push('Vuur-canvas: ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' (intern ' + c.width + 'x' + c.height + ')'); }
    out.push('Vuur-frames getekend: ' + (window.__skFrames || 0));
    out.push('Fouten: ' + (errs.length ? errs.join(' | ') : 'geen'));
    el.textContent = out.join('\n');
  }
  document.addEventListener('DOMContentLoaded', function () { show(); setInterval(show, 1000); });
})();
