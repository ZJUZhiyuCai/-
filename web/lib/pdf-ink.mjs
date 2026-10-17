import {PDFName,PDFNumber,PDFOperator,PDFDict,rgb,cmyk,setFillingColor} from 'pdf-lib';

export function createPdfInk(pdf,converter,{maxInk=400}={}) {
 const spots=new Map(),spaces=new Set(),cache=new Map();let convertedColors=0,maximumInk=0;
 const check=values=>{const total=values.reduce((a,b)=>a+b,0)*100;maximumInk=Math.max(maximumInk,total);if(total>maxInk+.01)throw Error('PRINT_TOTAL_INK_LIMIT');};
 return {
  recordSpace(space){spaces.add(space);},
  operators(page,ink='#111111') {
   if(typeof ink==='string') {
    const n=parseInt(ink.slice(1),16);if(converter){let values=cache.get(ink);if(!values){values=Array.from(converter.rgb16(new Uint16Array([(n>>16)*257,((n>>8)&255)*257,(n&255)*257])),x=>x/65535);cache.set(ink,values);convertedColors++;}check(values);spaces.add('DeviceCMYK');return [setFillingColor(cmyk(...values))];}spaces.add('DeviceRGB');
    return [setFillingColor(rgb((n>>16)/255,((n>>8)&255)/255,(n&255)/255))];
   }
   if(ink.space==='cmyk'){check(ink.values);spaces.add('DeviceCMYK');return [setFillingColor(cmyk(...ink.values))];}
   check(ink.alternate.map(x=>x*ink.tint));spaces.add('Separation');
   let spot=spots.get(ink.name);
   if(spot&&JSON.stringify(spot.alternate)!==JSON.stringify(ink.alternate))throw Error('SPOT_ALTERNATE_CONFLICT: '+ink.name);
   if(!spot){
    const transform=pdf.context.register(pdf.context.obj({FunctionType:2,Domain:[0,1],Range:[0,1,0,1,0,1,0,1],C0:[0,0,0,0],C1:ink.alternate,N:1}));
    const ref=pdf.context.register(pdf.context.obj([PDFName.of('Separation'),PDFName.of(ink.name),PDFName.of('DeviceCMYK'),transform]));
    spot={ref,key:PDFName.of('ShuyeInk'+spots.size),alternate:ink.alternate};spots.set(ink.name,spot);
   }
   const resources=page.node.Resources();let colorSpaces=resources.lookupMaybe(PDFName.of('ColorSpace'),PDFDict);
   if(!colorSpaces){colorSpaces=pdf.context.obj({});resources.set(PDFName.of('ColorSpace'),colorSpaces);}
   colorSpaces.set(spot.key,spot.ref);
   return [PDFOperator.of('cs',[spot.key]),PDFOperator.of('scn',[PDFNumber.of(ink.tint)])];
  },
  report(){return {colorSpaces:[...spaces],spotColors:[...spots].map(([name,s])=>({name,alternateCMYK:s.alternate})),iccConverted:!!converter,convertedColors,maximumInk:Math.round(maximumInk*100)/100};},
 };
}
