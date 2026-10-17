import {readFile} from 'node:fs/promises';
import {inspectFounderPdml} from '../lib/founder-pdml.mjs';
if(!process.argv[2])throw Error('Usage: node scripts/inspect-founder-pdml.mjs path-to-pdml-xml');
const bytes=await readFile(process.argv[2]);if(bytes.length>6_000_000)throw Error('PDML_XML_LIMIT');
console.log(JSON.stringify(inspectFounderPdml(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),null,2));
