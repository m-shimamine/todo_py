/* ============================================================
   インラインSVGアイコン
   移植元は Phosphor Icons をCDNから読んでいたが、ローカルアプリは
   オフラインで動く必要があるため自前のSVGに置き換える。
   ============================================================ */

const ICONS = {
  search:       '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',
  gear:         '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/>',
  sliders:      '<path d="M4 7h10M18.5 7H20M4 17h4.5M13 17h7"/><circle cx="14" cy="7" r="2.2"/><circle cx="10.5" cy="17" r="2.2"/>',
  calendar:     '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  calendarDots: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8" cy="15" r=".9"/><circle cx="12" cy="15" r=".9"/><circle cx="16" cy="15" r=".9"/>',
  calendarPlus: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
  calendarDot:  '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="12" cy="15.2" r="1.7"/>',
  calendarChk:  '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M9.5 15l2 2 3.5-3.5"/>',
  warning:      '<path d="M12 4 2.8 20h18.4L12 4Z"/><path d="M12 10v4M12 17.2v.1"/>',
  sun:          '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19 5l-1.8 1.8M6.8 17.2 5 19M19 19l-1.8-1.8M6.8 6.8 5 5"/>',
  tray:         '<path d="M4.2 6.5 3 13v4.5A1.5 1.5 0 0 0 4.5 19h15a1.5 1.5 0 0 0 1.5-1.5V13l-1.2-6.5A2 2 0 0 0 17.85 5H6.15a2 2 0 0 0-1.95 1.5Z"/><path d="M3 13h5l1.5 3h5L16 13h5"/>',
  flag:         '<path d="M5 22V4M5 4h12l-2.5 4L17 12H5"/>',
  checkCircle:  '<circle cx="12" cy="12" r="9"/><path d="M8 12.2l2.6 2.6L16 9.4"/>',
  check:        '<path d="M5 12.5 9.5 17 19 7.5"/>',
  clock:        '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.3 2"/>',
  caretLeft:    '<path d="M15 5 8 12l7 7"/>',
  caretRight:   '<path d="M9 5l7 7-7 7"/>',
  plus:         '<path d="M12 5v14M5 12h14"/>',
  x:            '<path d="M6 6l12 12M18 6 6 18"/>',
  trash:        '<path d="M4 7h16M10 4h4M9.5 11v7M14.5 11v7M6 7l1 13.2A1.8 1.8 0 0 0 8.8 22h6.4a1.8 1.8 0 0 0 1.8-1.8L18 7"/>',
  tag:          '<path d="M3 11.5V4.5A1.5 1.5 0 0 1 4.5 3h7l9 9-8 8-9.5-9.5Z"/><circle cx="8" cy="8" r="1.4"/>',
  folder:       '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4L11 8.5h8.5A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18Z"/>',
  info:         '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  caretUp:      '<path d="M5 15l7-7 7 7"/>',
  caretDown:    '<path d="M5 9l7 7 7-7"/>',
  pencil:       '<path d="M4 20h4.5L19 9.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20Z"/><path d="M14.5 6.5l3 3"/>',
  arrowsH:      '<path d="M7 9 4 12l3 3M17 9l3 3-3 3M4.5 12h15"/>'
};

/** アイコンのSVGを返す。fill指定が要る場合は cls に色クラスを渡す。 */
function icon(name, cls) {
  return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
         'stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
}
