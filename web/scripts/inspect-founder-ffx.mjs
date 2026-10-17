import {readFile} from 'node:fs/promises';
import {inspectFounderFfx} from '../lib/founder-ffx.mjs';
if(!process.argv[2])throw Error('Usage: node scripts/inspect-founder-ffx.mjs file.ffx');
console.log(JSON.stringify(inspectFounderFfx(new Uint8Array(await readFile(process.argv[2]))),null,2));
