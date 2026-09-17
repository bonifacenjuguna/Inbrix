const { Markup } = require('telegraf');
const style = require('./buttonStyle');

const b = (label) => style.text(label, style.BLUE);

/**
 * Single main menu, 2 rows, matching v1's actual scope — no admin zone
 * (owner-only bot, nothing to administer over anyone else), no Filters/
 * History rows yet (those are stubbed inside /settings until they're real
 * features, not fake shortcuts to a "coming soon" screen).
 *
 * Pause/Resume is one button whose label flips with current state, same
 * toggle pattern used throughout — never two separate buttons for one
 * on/off switch.
 */
function mainMenuFor(paused) {
  return Markup.keyboard([
    [b('📥 Status'), b(paused ? '▶️ Resume' : '⏸ Pause')],
    [b('⚙️ Settings'), b('❓ Help')],
  ]).resize();
}

module.exports = { mainMenuFor };
