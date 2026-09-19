'use strict';
/**
 * GitBook-syntax compatibility layer.
 *
 * Converts GitBook-native markup, {% hint %}, {% tabs %}, {% embed %},
 * {% content-ref %}, plus GFM-style `> [!TYPE]` alerts, the `=== Tab`
 * shorthand, and :emoji-name: shortcodes into the engine's own directive
 * syntax (:::hint, :::tabs, …) before the Markdown renderer runs.
 *
 * Pure string transforms: no I/O, no state.
 */

/** GFM alert names → engine hint types. */
const ALERT_TYPE_MAP = {
  info: 'info', note: 'info',
  tip: 'success', success: 'success',
  warning: 'warning', caution: 'warning',
  danger: 'danger', error: 'danger',
};

/** :shortcode: → emoji. Extend freely; unknown shortcodes pass through untouched. */
const EMOJI_MAP = {
  'square-dollar': '💲', 'users': '👥', 'user': '👤', 'comments-question-check': '💬',
  'arrow-up-right-dots': '📈', 'list': '📋', 'timer': '⏱️', 'chart-column': '📊',
  'circle-dollar-to-slot': '🎰', 'browser': '🌐', 'rocket-launch': '🚀',
  'book-open': '📖', 'gear-complex': '⚙️', 'gear': '⚙️', 'cog': '⚙️', 'unity': '🎮', 'gamepad': '🎮',
  'check': '✓', 'check-circle': '✅', 'xmark': '✕', 'times-circle': '❌',
  'warning': '⚠️', 'triangle-exclamation': '⚠️', 'info-circle': 'ℹ️',
  'circle-info': 'ℹ️', 'star': '⭐', 'globe': '🌍', 'server': '🖥️',
  'shield': '🛡️', 'bolt': '⚡', 'zap': '⚡', 'code': '💻', 'link': '🔗',
  'network-wired': '🔗', 'screwdriver-wrench': '🔧', 'wrench': '🔧',
  'puzzle-piece': '🧩', 'trophy': '🏆', 'medal': '🏅', 'flag': '🚩',
  'fire': '🔥', 'heart': '❤️', 'lock': '🔒', 'unlock': '🔓',
  'arrow-right': '→', 'arrow-left': '←', 'arrow-up': '↑', 'arrow-down': '↓',
  'plus': '＋', 'minus': '－', 'dollar-sign': '$', 'euro-sign': '€',
  'cloud': '☁️', 'database': '🗄️', 'folder': '📁', 'file': '📄',
  'image': '🖼️', 'video': '🎥', 'music': '🎵', 'microphone': '🎤',
  'phone': '📱', 'envelope': '✉️', 'calendar': '📅', 'clock': '🕐',
  'map-pin': '📍', 'location-dot': '📍', 'magnifying-glass': '🔍',
  'search': '🔍', 'eye': '👁️', 'hand-pointer': '👆', 'thumbs-up': '👍',
};

/** Convert every GitBook-flavored construct to engine directives. */
function preprocess(md) {
  // ── GFM-style alerts:  > [!TYPE]  on the first line of a blockquote ──────
  md = md.replace(/(?:^|\n)((?:> ?[^\n]*\n?)+)/g, (match, block) => {
    const firstLine = block.replace(/^> ?/, '').split('\n')[0].trim();
    const alert = firstLine.match(/^\[!(INFO|NOTE|TIP|SUCCESS|WARNING|CAUTION|DANGER|ERROR)\]$/i);
    if (!alert) return match;
    const type = ALERT_TYPE_MAP[alert[1].toLowerCase()];
    const body = block.split('\n').slice(1).map(l => l.replace(/^> ?/, '')).join('\n').trim();
    return `\n:::hint type="${type}"\n${body}\n:::`;
  });

  // ── Simplified tab shorthand:  === Tab Name … (=== ends the block) ───────
  // Guarded by a cheap test, the conversion regex is expensive on big files.
  if (/^=== /m.test(md)) {
    md = md.replace(/((?:(?:^|\n)=== [^\n]+\n(?:[\s\S]*?)(?=\n=== |\n===\s*$|\n===\s*\n|$))+)(?:\n===\s*)?/g, (match) => {
      const tabPattern = /(?:^|\n)=== ([^\n]+)\n([\s\S]*?)(?=\n=== |\n===\s*$|$)/g;
      const parts = [];
      let m;
      while ((m = tabPattern.exec(match)) !== null) {
        const title = m[1].trim();
        if (!title) continue;
        parts.push(`[${title}]\n${m[2].trim()}`);
      }
      if (!parts.length) return match;
      return `\n:::tabs\n${parts.join('\n---\n')}\n:::endtabs\n`;
    });
  }

  // ── {% hint style="…" %} … {% endhint %} ─────────────────────────────────
  // Styles map through the alert table so GitBook's "tip" lands on the same
  // success styling as `> [!TIP]` (they previously diverged).
  md = md.replace(/\{%\s*hint\s+style="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endhint\s*%\}/g, (_, style, content) => {
    const type = ALERT_TYPE_MAP[style.toLowerCase()] || style.toLowerCase();
    return `:::hint type="${type}"\n${content.trim()}\n:::`;
  });

  // ── {% tabs %} … {% endtabs %} ───────────────────────────────────────────
  md = md.replace(/\{%\s*tabs\s*%\}([\s\S]*?)\{%\s*endtabs\s*%\}/g, (_, content) => {
    const parts = [];
    content.replace(/\{%\s*tab\s+title="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endtab\s*%\}/g, (__, title, body) => {
      parts.push(`[${title}]\n${body.trim()}`);
    });
    return `:::tabs\n${parts.join('\n---\n')}\n:::endtabs`;
  });

  // ── {% embed url="…" %} (with or without {% endembed %}) ─────────────────
  md = md.replace(/\{%\s*embed\s+url="([^"]+)"\s*%\}[\s\S]*?\{%\s*endembed\s*%\}/g, (_, url) => `:::embed ${url}\n:::`);
  md = md.replace(/\{%\s*embed\s+url="([^"]+)"\s*%\}/g, (_, url) => `:::embed ${url}\n:::`);

  // ── {% content-ref url="…" %} … {% endcontent-ref %} ─────────────────────
  md = md.replace(/\{%\s*content-ref\s+url="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endcontent-ref\s*%\}/g, (_, url, content) => {
    const title = content.trim().replace(/^[`"'\[]+|[`"'\]]+$/g, '').trim();
    return `:::pageref href="${url}"\n${title}\n:::`;
  });

  // ── :emoji-name: shortcodes ──────────────────────────────────────────────
  md = md.replace(/:([a-z][a-z0-9-]*[a-z0-9]):/g, (match, name) => EMOJI_MAP[name] || match);

  return md;
}

module.exports = { preprocess, EMOJI_MAP, ALERT_TYPE_MAP };
