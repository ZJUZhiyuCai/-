import test from 'node:test';
import assert from 'node:assert/strict';
import {mcpResult} from '../lib/mcp-result.mjs';
test('large MCP responses preserve structured data without duplicating binaries',()=>{
 const value={revision:2,document:{title:'large',blocks:[{id:'img',type:'image',src:'data:image/png;base64,'+'A'.repeat(11000000)}]}};
 const full=mcpResult(value);assert.equal(full.structuredContent,value);assert.ok(full.content[0].text.length<300);
 const compact=mcpResult(value,'summary').structuredContent;assert.equal(compact.revision,2);assert.equal(compact.document,undefined);assert.equal(compact.documentSummary.blockCount,1);assert.deepEqual(compact.documentSummary.componentTypes,{image:1});assert.ok(JSON.stringify(compact).length<300);assert.ok(value.document.blocks[0].src);
 assert.equal(mcpResult({base64:'AAAA',pdfSha256:'digest'},'summary').structuredContent.pdfSha256,'digest');
 assert.throws(()=>mcpResult(value,'bad'),/INVALID_RESPONSE_MODE/);
});
