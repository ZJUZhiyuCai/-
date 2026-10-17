// Original Shuye example. Copy vendor files from @kittl/little-cms 1.0.3 with LICENSE.
import createCMS from '../vendor/lcms/lcms.browser.js';

const RGB8=(4<<16)|(3<<3)|1, CMYK8=(6<<16)|(4<<3)|1;
const RGB16=(4<<16)|(3<<3)|2, CMYK16=(6<<16)|(4<<3)|2;
const signature=(bytes,offset)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
let runtimePromise;
function validateIcc(bytes,output) {
 if (!(bytes instanceof Uint8Array)||bytes.byteLength<132||bytes.byteLength>2*1024*1024) throw Error('ICC_SIZE');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint32(0)!==bytes.byteLength||signature(bytes,36)!=='acsp')throw Error('ICC_HEADER');
 if(![2,4].includes(bytes[8]))throw Error('ICC_VERSION');
 if(!['XYZ ','Lab '].includes(signature(bytes,20)))throw Error('ICC_PCS');
 if(output?(signature(bytes,12)!=='prtr'||signature(bytes,16)!=='CMYK'):(!['mntr','scnr','prtr','spac'].includes(signature(bytes,12))||signature(bytes,16)!=='RGB '))throw Error(output?'ICC_OUTPUT_PROFILE_REQUIRED':'ICC_RGB_SOURCE_REQUIRED');
 const count=view.getUint32(128);if(count<1||count>4096||132+count*12>bytes.length)throw Error('ICC_TAG_TABLE');
 const names=new Set();
 for(let i=0;i<count;i++) {const p=132+i*12,name=signature(bytes,p),start=view.getUint32(p+4),size=view.getUint32(p+8);if(names.has(name)||start<132+count*12||size<8||start>bytes.length-size||start%4)throw Error('ICC_TAG_BOUNDS');names.add(name);}
 return {version:bytes[8],class:signature(bytes,12),space:signature(bytes,16).trim(),pcs:signature(bytes,20),bytes:bytes.length};
}
export const validateOutputIcc=bytes=>validateIcc(bytes,true);
export const validateRgbSourceIcc=bytes=>validateIcc(bytes,false);
async function runtime(module) {
 const compiledWasm=module||(await import('./icc-runtime.mjs')).default;
 return runtimePromise??=createCMS({instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(compiledWasm,imports);receive(instance,compiledWasm);return instance.exports;}});
}
export async function createCmykConverter(profileBytes,{intent=1,blackPointCompensation=true,wasmModule,sourceProfile}={}) {
 const metadata=validateOutputIcc(profileBytes);
 const sourceCmyk=sourceProfile&&signature(sourceProfile,16)==='CMYK',inputChannels=sourceCmyk?4:3;
 if(sourceProfile)(sourceCmyk?validateOutputIcc:validateRgbSourceIcc)(sourceProfile);
 if(![0,1,2,3].includes(intent)||typeof blackPointCompensation!=='boolean')throw Error('ICC_OPTIONS');
 const m=await runtime(wasmModule);let source=0,target=0,ptr=0,sourcePtr=0,t8=0,t16=0,closed=false;
 try {
  ptr=m._malloc(profileBytes.length);if(!ptr)throw Error('ICC_ALLOC');m.HEAPU8.set(profileBytes,ptr);
  target=m._cmsOpenProfileFromMem(ptr,profileBytes.length);if(!target)throw Error('ICC_PROFILE_PARSE');
  if(sourceProfile){sourcePtr=m._malloc(sourceProfile.length);if(!sourcePtr)throw Error('ICC_ALLOC');m.HEAPU8.set(sourceProfile,sourcePtr);source=m._cmsOpenProfileFromMem(sourcePtr,sourceProfile.length);}else source=m._cmsCreate_sRGBProfile();if(!source)throw Error('ICC_SOURCE_CREATE');
  const flags=blackPointCompensation?0x2000:0;
  t8=m._cmsCreateTransform(source,sourceCmyk?CMYK8:RGB8,target,CMYK8,intent,flags);
  t16=m._cmsCreateTransform(source,sourceCmyk?CMYK16:RGB16,target,CMYK16,intent,flags);
  if(!t8||!t16)throw Error('ICC_TRANSFORM_UNSUPPORTED');
 } catch(error) {if(t8)m._cmsDeleteTransform(t8);if(t16)m._cmsDeleteTransform(t16);throw error;}
 finally {if(ptr)m._free(ptr);if(sourcePtr)m._free(sourcePtr);if(source)m._cmsCloseProfile(source);if(target)m._cmsCloseProfile(target);}
 const transform=(input,bits)=>{
  if(closed)throw Error('ICC_CONVERTER_CLOSED');
  const Ctor=bits===8?Uint8Array:Uint16Array;
  if(!(input instanceof Ctor)||input.length%inputChannels||input.length>65536*inputChannels)throw Error('ICC_CHUNK_LIMIT');
  const pixels=input.length/inputChannels,bytes=bits/8,inPtr=m._malloc(input.byteLength),outPtr=m._malloc(pixels*4*bytes);
  try {if(!inPtr||!outPtr)throw Error('ICC_ALLOC');m.HEAPU8.set(new Uint8Array(input.buffer,input.byteOffset,input.byteLength),inPtr);m._cmsDoTransform(bits===8?t8:t16,inPtr,outPtr,pixels);return new Ctor(m.HEAPU8.buffer,outPtr,pixels*4).slice();}
  finally {if(inPtr)m._free(inPtr);if(outPtr)m._free(outPtr);}
 };
 return {metadata,inputChannels,convert8:input=>transform(input,8),rgb8:input=>transform(input,8),rgb16:input=>transform(input,16),memoryBytes:()=>m.HEAPU8.byteLength,close(){if(!closed){m._cmsDeleteTransform(t8);m._cmsDeleteTransform(t16);closed=true;}}};
}
