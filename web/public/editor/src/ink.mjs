// Device ink values are explicit authoring values, never an ICC conversion.
export function validateInk(ink) {
 if(typeof ink==='string'&&/^#[a-fA-F0-9]{6}$/.test(ink))return;
 if(!ink||typeof ink!=='object'||Array.isArray(ink))throw Error('COMPOSITION_COLOR');
 const allowed=ink.space==='cmyk'?['space','values']:ink.space==='spot'?['space','name','tint','alternate']:[];
 if(!allowed.length||Object.keys(ink).some(k=>!allowed.includes(k)))throw Error('COMPOSITION_COLOR');
 const values=ink.space==='cmyk'?ink.values:ink.alternate;
 if(!Array.isArray(values)||values.length!==4||values.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('COMPOSITION_INK_VALUES');
 if(ink.space==='spot'&&(typeof ink.name!=='string'||!ink.name.trim()||ink.name.length>80||/[\u0000-\u001f\u007f]/.test(ink.name)||['All','None','Cyan','Magenta','Yellow','Black'].includes(ink.name)||!Number.isFinite(ink.tint)||ink.tint<0||ink.tint>1))throw Error('COMPOSITION_SPOT_COLOR');
}
export function previewInk(ink,fallback='transparent') {
 if(!ink)return fallback;if(typeof ink==='string')return ink;
 const [c,m,y,k]=(ink.space==='spot'?ink.alternate.map(v=>v*ink.tint):ink.values);
 return `rgb(${[c,m,y].map(v=>Math.round(255*(1-v)*(1-k))).join(',')})`;
}
