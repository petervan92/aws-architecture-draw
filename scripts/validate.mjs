#!/usr/bin/env node
// Validate spec(s) against the AWS diagram guideline without rendering.
// Usage: node scripts/validate.mjs <spec.yaml> [...] [--strict]
import { loadSpec, validate, formatReport } from '../src/spec.mjs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const files = args.filter(a => a !== '--strict');
if (!files.length) { console.error('Usage: node scripts/validate.mjs <spec.yaml> [...] [--strict]'); process.exit(2); }
let bad = 0;
for (const f of files) {
  console.log(`== ${f}`);
  try {
    const res = validate(loadSpec(f));
    console.log(formatReport(res));
    if (res.errors.length || (strict && res.warnings.length)) bad++;
  } catch (e) { console.log(`ERROR   ${e.message}`); bad++; }
}
process.exit(bad ? 1 : 0);
