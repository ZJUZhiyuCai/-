// Optional local test against the vendor's bundled legacy ShellNew fixture.
// This repository deliberately does not distribute the fixture.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inspectFounderFfx} from '../lib/founder-ffx.mjs';
if(!process.argv[2])throw Error('Pass the locally owned ShellNew/newfile.ffx fixture');
const bytes=new Uint8Array(await readFile(process.argv[2]));assert.equal(createHash('sha256').update(bytes).digest('hex'),'961000261a1e3c210c009d75c7ac3ee936af7af832986b7b6425c0c9dcfd9860');
const report=inspectFounderFfx(bytes);assert.equal(report.records.length,18);assert.equal(report.stopOffset,0x5ca0);assert.equal(report.stopReason,'UNKNOWN_CLASS_0x1006902');
let truncated=0;for(const r of report.records){for(let p=r.start+1;p<r.end;p++){assert.throws(()=>inspectFounderFfx(bytes.slice(0,p)));truncated++;}for(const field of ['type','version']){const copy=bytes.slice(),v=new DataView(copy.buffer);if(field==='type')v.setUint32(r.start,0xdeadbeef,true);else v.setUint16(r.start+4,0x7fff,true);const result=inspectFounderFfx(copy);assert.equal(result.stopOffset,r.start);}}
const result={sha256:createHash('sha256').update(bytes).digest('hex'),records:report.records.length,stopOffset:report.stopOffset,stopReason:report.stopReason,truncatedInputsRejected:truncated,unknownTypeBoundaries:18,unknownVersionBoundaries:18,complete:false};
await writeFile('.sites-runtime/ffx-acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
