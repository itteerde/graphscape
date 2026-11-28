/** Default CSS of the DOM parts of a view (tooltip, buttons, link panel). Fully themable via `--gs-*` variables. */
export const CSS = `
.gs-container{position:relative;overflow:hidden}
.gs-root{position:absolute;inset:0;overflow:hidden;font-family:var(--gs-font,system-ui,sans-serif);color:var(--gs-panel-fg,#1f2933);touch-action:none;user-select:none;-webkit-user-select:none}
.gs-root canvas{display:block;outline:none}
.gs-tooltip{position:absolute;z-index:3;pointer-events:none;max-width:260px;padding:6px 9px;font-size:12px;line-height:1.35;background:var(--gs-panel-bg,rgba(255,255,255,.96));color:var(--gs-panel-fg,#1f2933);border:1px solid var(--gs-panel-border,#cfd6de);border-radius:var(--gs-radius,4px);box-shadow:0 2px 8px rgba(0,0,0,.18);white-space:pre-wrap;overflow-wrap:anywhere}
.gs-tooltip[hidden]{display:none}
.gs-search{position:absolute;z-index:2;left:10px;top:10px;display:flex;align-items:center;gap:6px;height:32px;padding:0 6px 0 9px;background:var(--gs-panel-bg,rgba(255,255,255,.96));color:var(--gs-panel-fg,#1f2933);border:1px solid var(--gs-panel-border,#cfd6de);border-radius:var(--gs-radius,4px)}
.gs-search:focus-within{border-color:var(--gs-accent,#e8590c)}
.gs-search input{width:150px;max-width:38vw;min-width:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:13px}
.gs-search-count{font-size:12px;opacity:.7;white-space:nowrap}
.gs-search-clear{border:0;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer;padding:0 4px;opacity:.7}
.gs-search-clear:hover{opacity:1}
.gs-search-clear[hidden]{display:none}
.gs-help{position:absolute;z-index:4;right:52px;bottom:10px;width:min(360px,calc(100% - 70px));max-height:calc(100% - 20px);overflow:auto;padding:10px 12px;font-size:12px;line-height:1.4;background:var(--gs-panel-bg,rgba(255,255,255,.98));color:var(--gs-panel-fg,#1f2933);border:1px solid var(--gs-panel-border,#cfd6de);border-radius:var(--gs-radius,4px);box-shadow:0 4px 14px rgba(0,0,0,.22);user-select:text;-webkit-user-select:text}
.gs-help-title{font-weight:700;font-size:13px;margin-bottom:6px}
.gs-help-row{display:grid;grid-template-columns:42% 1fr;gap:8px;padding:3px 0;border-top:1px solid var(--gs-panel-border,#cfd6de)}
.gs-help-row b{font-weight:600}
.gs-tt-title{font-weight:600}
.gs-tt-muted{opacity:.7}
.gs-tt-hint{margin-top:3px;color:var(--gs-accent,#e8590c)}
.gs-chip{position:absolute;z-index:2;height:26px;padding:0 11px;font:600 12px var(--gs-font,system-ui,sans-serif);cursor:pointer;white-space:nowrap;background:var(--gs-panel-bg,#fff);color:var(--gs-panel-fg,#1f2933);border:1.5px solid var(--gs-accent,#e8590c);border-radius:13px;box-shadow:0 2px 6px rgba(0,0,0,.2)}
.gs-chip[hidden]{display:none}
.gs-chip:hover{background:var(--gs-accent,#e8590c);color:#fff}
.gs-chip:focus-visible{outline:2px solid var(--gs-accent,#e8590c);outline-offset:2px}
.gs-controls{position:absolute;z-index:2;right:10px;bottom:10px;display:flex;flex-direction:column;gap:4px}
.gs-btn{min-width:32px;height:32px;padding:0 8px;font:inherit;font-size:13px;cursor:pointer;background:var(--gs-panel-bg,rgba(255,255,255,.96));color:var(--gs-panel-fg,#1f2933);border:1px solid var(--gs-panel-border,#cfd6de);border-radius:var(--gs-radius,4px)}
.gs-btn:hover{border-color:var(--gs-accent,#e8590c)}
.gs-btn:focus-visible{outline:2px solid var(--gs-accent,#e8590c);outline-offset:1px}
.gs-pseudo-fullscreen{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;z-index:2147483000;margin:0!important;border-radius:0!important}
.gs-box{position:absolute;z-index:2;pointer-events:none;border:1px dashed var(--gs-accent,#e8590c);background:color-mix(in srgb,var(--gs-accent,#e8590c) 12%,transparent)}
.gs-panel{position:absolute;z-index:4;top:0;right:0;bottom:0;width:min(46%,520px);display:flex;flex-direction:column;background:var(--gs-panel-bg,#fff);border-left:1px solid var(--gs-panel-border,#cfd6de);box-shadow:-4px 0 14px rgba(0,0,0,.15)}
.gs-panel-head{display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--gs-panel-border,#cfd6de);font-size:13px}
.gs-panel-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gs-panel iframe{flex:1;border:0;width:100%;background:#fff}
.gs-error{padding:12px;font:13px system-ui,sans-serif;color:#b42318}
`;

export function injectStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('gs-styles')) return;
  const el = document.createElement('style');
  el.id = 'gs-styles';
  el.textContent = CSS;
  document.head.appendChild(el);
}
