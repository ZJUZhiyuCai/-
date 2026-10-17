// Observed legacy FFX stream profile bundled with FX9. Independent bounded reader.
// Unknown class payloads have no proven length: stop, never scan for guessed IDs.
export function inspectFounderFfx(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<0x5048||bytes.length>8*1024*1024)throw Error('FFX_SIZE');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(view.getUint32(0,true)!==0x1234||view.getUint32(4,true)!==0x5678)throw Error('FFX_MAGIC');
 let pos=0x5048;
 const read=(kind='u32')=>{const n={u8:1,u16:2,u32:4,f32:4}[kind];if(pos+n>bytes.length)throw Error('FFX_TRUNCATED_AT_'+pos);const v=kind==='u8'?view.getUint8(pos):kind==='u16'?view.getUint16(pos,true):kind==='f32'?view.getFloat32(pos,true):view.getUint32(pos,true);pos+=n;if(!Number.isFinite(v))throw Error('FFX_NONFINITE');return v;};
 const unsupported=message=>{const error=Error(message);error.unsupported=true;throw error;};
 const version=v=>{const at=pos,found=read('u16');if(found!==v)unsupported(`FFX_VERSION_${found}_AT_${at}_EXPECTED_${v}`);};
 const vector=(width=1)=>{const n=read();if(n>10000||n*4*width>bytes.length-pos)throw Error('FFX_VECTOR_LIMIT');return Array.from({length:n},()=>width===1?read():[read(),read()]);};
 const base=()=>{version(1);return {children:vector(),state:read()};};
 const count=()=>{const n=read();if(n>10000)throw Error('FFX_COUNT_LIMIT');return n;};
 const raw=n=>{if(n<0||n>bytes.length-pos)throw Error('FFX_TRUNCATED_AT_'+pos);const out=Array.from(bytes.subarray(pos,pos+n),b=>b.toString(16).padStart(2,'0')).join('');pos+=n;return out;};
 const text=()=>{const n=count();if(n*2>bytes.length-pos)throw Error('FFX_STRING_LIMIT');const value=new TextDecoder('utf-16le',{fatal:true}).decode(bytes.subarray(pos,pos+n*2));pos+=n*2;return value;};
 const supportedVersion=values=>{const at=pos,v=read('u16');if(!values.includes(v))unsupported('FFX_VERSION_'+v+'_AT_'+at);return v;};
 const properties=()=>{const n=read('u16');if(n>4096)throw Error('FFX_PROPERTY_LIMIT');return Array.from({length:n},()=>{const key=read(),length=read();if(length>100000||length*2>bytes.length-pos)throw Error('FFX_STRING_LIMIT');const text=new TextDecoder('utf-16le',{fatal:true}).decode(bytes.subarray(pos,pos+length*2));pos+=length*2;return {key,text};});};
 const records=[];let stopReason='RECORD_LIMIT';
 for(let i=0;i<100;i++){
  const start=pos;try{
   const type=read();let record;
   if(type===0x1000605){record={class:'Cv_FitDocRoot',base:base()};version(1);record.publicationReferences=[read(),read()];version(5);record.fieldB0=read();record.vector98=vector();record.fields=Object.fromEntries(['b4','b8','bc','c0','c4','c8','d4','cc','d8','d0'].map(k=>[k,read()]));record.legacyDiscarded=read();}
   else if(type===0x1000610){record={class:'Cv_NormalContentSpread',base:base()};version(1);record.storedRect70=Array.from({length:4},()=>read('f32'));version(2);record.storedRectB0=Array.from({length:4},()=>read('f32'));record.flagC8=read('u8');record.vectorE0=vector(2);version(2);record.field100=read();record.properties=properties();}
   else if(type===0x1001205){record={class:'Cv_TextFlowContainer'};version(3);record.vector20=vector();record.vector38=vector();record.field50=read();record.field70=read();record.vector78=vector();}
   else if(type===0x1006901){
    version(9);record={class:'Cv_DocParameterEnv',version:9,fieldOffsetsRelativeTo:'serialization interface (root + 8)',fields:{}};const f=record.fields;
    for(const [off,kind] of [['2c4','u32'],['1dc','u32'],['1e0','u32'],['158','u8'],['159','u8'],['15a','u8'],['15b','u8'],['16c','u32'],['15c','u8'],['15e','u8'],['15f','u8'],['160','u32'],['164','u32'],['168','u32']])f[off]=read(kind);
    version(1);f['189']={enabled:read('u8'),string1:text(),string2:text(),raw4:raw(4)};
    f['1e4']=read();f.legacyRaw12=raw(12);f['1ca']=raw(10);f['1ec']=raw(4);f['1f0']=raw(8);
    for(const off of ['1f8','1fc','200'])f[off]=read();
    f['19e']=Array.from({length:count()},()=>({key:read(),pairs:Array.from({length:count()},()=>[text(),text()])}));
    for(const off of ['188','2c8','2c0'])f[off]=read('u8');f['2e8Packed']=raw(4);
   }
   else if([0x1000650,0x1006b03,0x1009c64].includes(type)){record={class:{[0x1000650]:'Cv_DocLayerContainer',[0x1006b03]:'Cv_MasterSpreadContainer',[0x1009c64]:'Cv_DOMCustomedItemAgent'}[type],base:base()};}
   else if(type===0x1006b01){version(1);record={class:'Cv_MasterSpreadManager',version:1,interfaceFields20_24_28_2c:[read(),read(),read(),read()],vector30:vector()};}
   else if(type===0x1009101){const v=supportedVersion([1,2]);record={class:'Cv_PageNumManager',version:v,fields20_24:[read(),read()]};if(v===2)record.flag28=read('u8');record.list30=vector();record.list40=vector();record.vector50=vector();}
   else if(type===0x1009104){version(1);record={class:'Cv_PageOrder',version:1,field18:read(),vector20:vector()};}
   else if(type===0x1002901){version(1);record={class:'Cv_NewsManager',version:1,vector18:vector()};}
   else if(type===0x1004207){record={class:'Cv_PhotoManager',version:supportedVersion([1,2])};}
   else if(type===0x1009106){record={class:'Cv_ChapterManager',base:base()};version(1);record.version=1;record.field40=read();}
   else if([0x1000615,0x1000614,0x1000619,0x1000617,0x1000618].includes(type)){
    record={class:{[0x1000615]:'Cv_SpreadLayer_Empty',[0x1000614]:'Cv_SpreadLayer_Page',[0x1000619]:'Cv_SpreadLayer_PageNum',[0x1000617]:'Cv_SpreadLayer_Normal',[0x1000618]:'Cv_SpreadLayer_Guide'}[type],base:base()};version(1);record.version=1;record.byte68=read('u8');record.field6c=read();
    if(type===0x1000614){version(1);record.pageVersion=1;record.field80=read();}
    if(type===0x1000619){record.pageNumVersion=supportedVersion([1,2]);if(record.pageNumVersion===1)record.legacyVector78=vector();else record.nestedVector78=Array.from({length:count()},()=>vector());}
   }
   else unsupported('UNKNOWN_CLASS_0x'+type.toString(16));
   records.push({type:'0x'+type.toString(16),start,end:pos,...record});if(pos===bytes.length){stopReason='END_OF_BYTES';break;}
  }catch(e){if(!e.unsupported)throw e;pos=start;stopReason=e.message;break;}
 }
 const previewBytes=view.getUint32(0x18,true)&0x7fffffff;let preview=null;
 if(previewBytes>=40&&previewBytes<=0x5048-0xc70&&view.getUint32(0xc70,true)===40){const width=view.getInt32(0xc74,true),height=view.getInt32(0xc78,true),bits=view.getUint16(0xc7e,true);if(width>0&&width<=4096&&height!==0&&Math.abs(height)<=4096)preview={offset:0xc70,bytes:previewBytes,width,height,bits};}
 return {format:'Founder FFX',profile:'observed legacy stream bundled with FX9',preview,records,stopOffset:pos,stopReason,unparsedBytes:bytes.length-pos,complete:false,editableImport:false,nativeExport:false,referenceApplicationVerified:false};
}
