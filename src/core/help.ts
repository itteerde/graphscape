import type { GraphscapeConfig } from './config';
import { describeLinkGesture } from './url';

export interface HelpLine {
  keys: string;
  text: string;
}

/** The controls that are actually available with this configuration, for the help popover. */
export function helpLines(cfg: GraphscapeConfig, mac = false): HelpLine[] {
  const i = cfg.interaction;
  const dim3 = cfg.dimension === '3d';
  const lines: HelpLine[] = [];
  lines.push({ keys: 'Drag background', text: dim3 ? (cfg.camera.rotation === 'free' ? 'Rotate freely' : 'Rotate') : 'Pan' });
  if (dim3) lines.push({ keys: 'Right-drag', text: 'Pan' });
  lines.push({ keys: 'Mouse wheel, pinch', text: 'Zoom' });
  if (i.select) lines.push({ keys: 'Click', text: 'Select a node or edge' });
  if (i.select && i.multiSelect) lines.push({ keys: 'Shift+click, Shift+drag', text: 'Add to the selection, box select' });
  if (i.dragNodes) lines.push({ keys: 'Drag a node', text: 'Move it (the whole selection moves together)' });
  if (i.dragNodes && i.axisLock) lines.push({ keys: dim3 ? 'X, Y or Z while dragging' : 'X or Y while dragging', text: 'Lock the movement to that axis' });
  if (i.gizmo) lines.push({ keys: 'Select, then use the handles', text: 'Move, rotate or scale the selection (Ctrl snaps)' });
  if (i.openLinks !== 'never') {
    const g = describeLinkGesture(i.openLinks, mac);
    lines.push({ keys: `${g} on a badge item`, text: 'Open the linked page' });
    if (cfg.links.chip) lines.push({ keys: `Select it, then "${cfg.links.chipLabel}"`, text: 'Open the page without a modifier key' });
  }
  if (cfg.ui.search) lines.push({ keys: 'Search box', text: 'Find and select nodes while typing; Enter zooms to them. group:Sales, tag:x, id:n1 search one field' });
  if (cfg.ui.controls) lines.push({ keys: '+  \u2212  Fit  2D/3D', text: 'Zoom in, zoom out, fit the graph, switch 2D / 3D' });
  if (cfg.ui.fullscreen) lines.push({ keys: 'Full screen button', text: 'Full screen; Esc leaves it' });
  return lines;
}
