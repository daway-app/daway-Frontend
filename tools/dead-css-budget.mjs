/**
 * Dead-CSS budget guard — audit B-8.
 *
 * The audit found ~228 of 622 CSS classes unreferenced. Independently
 * re-measured (tools/dead-css.mjs, conservative): 159 of 634 = 25%.
 *
 * WHY THIS GUARD INSTEAD OF A BULK DELETE
 * ---------------------------------------
 * The audit itself warns "do not delete blind (some are runtime state classes)".
 * That warning proved correct: the scanner/QR block (lines 1302–1692) looks
 * entirely dead but 4 of its classes ARE live (`ac-scan-actions`, `ac-scan-or`,
 * `ac-entry-card`, `ph-btn`). A line-range move would silently break the POS.
 *
 * So the deliverable is a RATCHET: the current dead count is frozen as the
 * budget. CI/`npm run check:css` fails if the number GROWS, which stops new dead
 * CSS from accumulating while each cluster is pruned deliberately, in a review
 * of its own, with visual QA.
 *
 * Usage:
 *   node tools/dead-css-budget.mjs          # check (exit 1 if over budget)
 *   node tools/dead-css-budget.mjs --accept # raise/lower the stored budget
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { measureDeadCss } from './dead-css.mjs';

const BUDGET_FILE = 'tools/dead-css-budget.json';

const now = measureDeadCss();

if (process.argv.includes('--accept')) {
  writeFileSync(
    BUDGET_FILE,
    JSON.stringify(
      {
        _comment:
          'Dead-CSS ratchet. `unused` may only DECREASE. Raise only with an ' +
          'explicit justification in the commit message. See tools/dead-css-budget.mjs.',
        unused: now.unused,
        total: now.total,
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`✓ budget accepted: ${now.unused}/${now.total} unused`);
  process.exit(0);
}

if (!existsSync(BUDGET_FILE)) {
  console.error('✗ no budget file — run with --accept first');
  process.exit(1);
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));

if (now.unused > budget.unused) {
  console.error(
    `✗ dead CSS GREW: ${now.unused} > budget ${budget.unused}\n` +
      `  Run \`node tools/dead-css.mjs\` for the list.\n` +
      `  Either remove the new dead rules or justify raising the budget.`,
  );
  process.exit(1);
}

if (now.unused < budget.unused) {
  console.log(
    `✓ dead CSS shrank: ${now.unused} < budget ${budget.unused}` +
      ` — run with --accept to lock in the win.`,
  );
} else {
  console.log(`✓ dead CSS at budget: ${now.unused}/${now.total}`);
}
