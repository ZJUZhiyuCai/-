import UPNGModule from '@pdf-lib/upng';
const UPNG=UPNGModule.default||UPNGModule;
import jpeg from 'jpeg-js';

import {createCmykConverter} from './icc.mjs';
import {decodeCmyk} from '../vendor/jpeg-cmyk/decoder.mjs';
const signature=(b,p,n=4)=>String.fromCharCode(...b.subarray(p,p+n));
export function readImage(dataUrl){
 const b=Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',')+1)),c=>c.charCodeAt(0)),v=new DataView(b.buffer);let width=0,height=0,components=0,embeddedICC=false,compressedICC=null;const iccChunks=[];
 if(dataUrl.startsWith('data:image/png')){
  if(b.length<33||signature(b,1,3)!=='PNG')throw Error('IMAGE_PNG_HEADER');width=v.getUint32(16);height=v.getUint32(20);
  for(let p=8;p+12<=b.length;){const n=v.getUint32(p);if(n>b.length-p-12)throw Error('IMAGE_PNG_CHUNK');const type=signature(b,p+4);if(type==='iCCP'){if(embeddedICC)throw Error('IMAGE_ICC_DUPLICATE');embeddedICC=true;const end=b.indexOf(0,p+8);if(end<p+9||end>=p+8+n-1||end-p-8>79||b[end+1]!==0)throw Error('IMAGE_ICC_HEADER');compressedICC=b.slice(end+2,p+8+n);}if(type==='acTL')throw Error('IMAGE_ANIMATION_UNSUPPORTED');p+=12+n;}
 }else{
  if(b[0]!==255||b[1]!==216)throw Error('IMAGE_JPEG_HEADER');
  for(let p=2;p+4<b.length;){if(b[p++]!==255)throw Error('IMAGE_JPEG_MARKER');while(b[p]===255)p++;const marker=b[p++];if(marker===218||marker===217)break;const n=v.getUint16(p);if(n<2||p+n>b.length)throw Error('IMAGE_JPEG_LENGTH');if(marker===226&&signature(b,p+2,11)==='ICC_PROFILE'){if(n<16||b[p+13]!==0)throw Error('IMAGE_ICC_HEADER');embeddedICC=true;iccChunks.push({index:b[p+14],total:b[p+15],bytes:b.slice(p+16,p+n)});}if([192,193,194].includes(marker)){height=v.getUint16(p+3);width=v.getUint16(p+5);components=b[p+7];}p+=n;}
 }
 if(!width||!height||width*height>2_000_000||width>16000||height>16000)throw Error('IMAGE_PIXEL_LIMIT_2_MP');
 return {bytes:b,width,height,components,embeddedICC,compressedICC,iccChunks,png:dataUrl.startsWith('data:image/png')};
}
async function sourceIcc(info){
 if(info.compressedICC){const reader=new Blob([info.compressedICC]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw Error('IMAGE_ICC_SIZE');chunks.push(value);}}finally{await reader.cancel();}const out=new Uint8Array(size);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;}
 const chunks=info.iccChunks.sort((a,b)=>a.index-b.index);if(!chunks.length||chunks.some((c,i)=>c.index!==i+1||c.total!==chunks.length))throw Error('IMAGE_ICC_CHUNKS');const size=chunks.reduce((n,c)=>n+c.bytes.length,0);if(size>2*1024*1024)throw Error('IMAGE_ICC_SIZE');const out=new Uint8Array(size);let at=0;for(const c of chunks){out.set(c.bytes,at);at+=c.bytes.length;}return out;
}
export async function embedPrintImage(pdf,dataUrl,converter,options={}){
 const info=readImage(dataUrl);
 if(!converter)return {image:info.png?await pdf.embedPng(info.bytes):await pdf.embedJpg(info.bytes),converted:false};
 let imageConverter;
 try{const source=info.embeddedICC?await sourceIcc(info):info.components===4?options.sourceCmykProfile:undefined;if(info.components===4&&!source)throw Error('IMAGE_CMYK_SOURCE_ICC_REQUIRED');if(source){imageConverter=await createCmykConverter(options.iccProfile,{intent:options.intent??1,blackPointCompensation:options.blackPointCompensation??true,wasmModule:options.wasmModule,sourceProfile:source});if(imageConverter.inputChannels!==(info.components===4?4:3))throw Error('IMAGE_ICC_CHANNEL_MISMATCH');}return await convertImage(pdf,info,imageConverter||converter,options);}finally{imageConverter?.close();}
}
async function convertImage(pdf,info,converter,{maxInk=400}){
 let rgba;if(info.png){const decoded=UPNG.decode(info.bytes.buffer);rgba=new Uint8Array(UPNG.toRGBA8(decoded)[0]);}else if(info.components===4)rgba=decodeCmyk(info.bytes).data;else rgba=jpeg.decode(info.bytes,{useTArray:true,formatAsRGBA:true,maxResolutionInMP:2,maxMemoryUsageInMB:32,tolerantDecoding:false}).data;
 const pixels=info.width*info.height,out=new Uint8Array(pixels*4),alpha=new Uint8Array(pixels);let hasAlpha=false,maximumInk=0;
 for(let base=0;base<pixels;base+=65536){const count=Math.min(65536,pixels-base),channels=info.components===4?4:3,input=new Uint8Array(count*channels);for(let i=0;i<count;i++){const at=(base+i)*4;input.set(rgba.subarray(at,at+channels),i*channels);alpha[base+i]=channels===4?255:rgba[at+3];if(alpha[base+i]!==255)hasAlpha=true;}const converted=converter.convert8(input);for(let i=0;i<count;i++){const total=(converted[i*4]+converted[i*4+1]+converted[i*4+2]+converted[i*4+3])*100/255;maximumInk=Math.max(maximumInk,total);if(total>maxInk+.8)throw Error('PRINT_TOTAL_INK_LIMIT');}out.set(converted,base*4);}
 const common={Type:'XObject',Subtype:'Image',Width:info.width,Height:info.height,BitsPerComponent:8,Interpolate:false};
 const mask=hasAlpha?pdf.context.register(pdf.context.flateStream(alpha,{...common,ColorSpace:'DeviceGray'})):undefined;
 const ref=pdf.context.register(pdf.context.flateStream(out,{...common,ColorSpace:'DeviceCMYK',...(mask?{SMask:mask}:{})}));
 // Registered raw CMYK XObject; the writer places it with explicit PDF operators.
 const image={ref,width:info.width,height:info.height,embed:async()=>ref,raw:true};
 return {image,converted:true,sourceProfile:info.embeddedICC?'embedded ICC':info.components===4?'provided CMYK ICC':'sRGB',maximumInk:Math.round(maximumInk*100)/100,alpha:hasAlpha};
}
