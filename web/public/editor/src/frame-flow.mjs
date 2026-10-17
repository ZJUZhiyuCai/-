// Shared deterministic line plan. Coordinates are points, relative to frame top-left.
// Source ranges always use UTF-16 grapheme boundaries, including line separators.
import {flowRichStory} from './rich-story.mjs';
const PT=72/25.4;
const noStart=new Set([... '、。，．：；？！‼⁇⁈⁉）〕］｝〉》」』】〗〙〛’”％‰℃°…']);
const noEnd=new Set([... '（〔［｛〈《「『【〖〘〚‘“']);
const latin=g=>/^[\p{Script=Latin}\p{Number}_]+$/u.test(g);
const newline=g=>g==='\n'||g==='\r\n'||g==='\r';
const intersect=(a,b)=>a.flatMap(([l,r])=>b.map(([x,y])=>[Math.max(l,x),Math.min(r,y)]).filter(([x,y])=>y-x>1e-7));
function polygonIntervals(points,y){
 const xs=[];for(let i=0;i<points.length;i++){const [x1,y1]=points[i],[x2,y2]=points[(i+1)%points.length];if((y1<=y&&y2>y)||(y2<=y&&y1>y))xs.push(x1+(y-y1)*(x2-x1)/(y2-y1));}
 xs.sort((a,b)=>a-b);const out=[];for(let i=0;i+1<xs.length;i+=2)out.push([xs[i],xs[i+1]]);return out;
}
function bandIntervals(f,vertical,start,end,low,high){
 let intervals=[[low,high]];
 const convert=([x,y])=>vertical?[y*PT,(f.width-x)*PT]:[x*PT,y*PT];
 if(f.shape){const points=f.shape.map(convert),ys=[start+1e-7,end-1e-7,...points.flatMap(p=>p[1]>start&&p[1]<end?[p[1]-1e-7,p[1]+1e-7]:[])];for(const y of ys)intervals=intersect(intervals,polygonIntervals(points,y));}
 for(const r of f.exclusions||[]){const a=convert([r.x,r.y]),b=convert([r.x+r.width,r.y+r.height]),l=Math.min(a[0],b[0]),h=Math.max(a[0],b[0]);if(Math.max(a[1],b[1])<=start||Math.min(a[1],b[1])>=end)continue;intervals=intervals.flatMap(([x,y])=>[[x,Math.min(y,l)],[Math.max(x,h),y]].filter(([x,y])=>y-x>1e-7));}
 return intervals;
}
export function rebaseTextSpans(text,next,spans=[]){
 // Preserve marks outside the changed middle; inserted text inherits the mark at insertion.
 const a=[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text)],b=[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(next)];let p=0,s=0;
 while(p<a.length&&p<b.length&&a[p].segment===b[p].segment)p++;
 while(s<a.length-p&&s<b.length-p&&a[a.length-1-s].segment===b[b.length-1-s].segment)s++;
 const from=a[p]?.index??text.length,to=a[a.length-s]?.index??text.length,newTo=b[b.length-s]?.index??next.length,delta=newTo-to;
 return spans.flatMap(r=>{const out=[];if(r.start<from)out.push({...r,end:Math.min(r.end,from)});if(r.start<=from&&r.end>from&&newTo>from)out.push({...r,start:from,end:newTo});if(r.end>to)out.push({...r,start:Math.max(r.start,to)+delta,end:r.end+delta});return out.filter(r=>r.end>r.start);});
}
export function flowStory(story,frames,measure){
 if(story.blocks)return flowRichStory(story,frames,measure,flowText);
 return flowText(story,frames,measure);
}
export function flowText(story,frames,measure){
 const gs=[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(story.text)],runs=[];let cursor=0;
 const offset=i=>gs[i]?.index??story.text.length;
 for(const f of frames){
  const start=cursor,lines=[],vertical=f.writingMode==='vertical-rl',pad=(f.padding||0)*PT,inline=(vertical?f.height:f.width)*PT,block=(vertical?f.width:f.height)*PT;
  const weights=f.columns||[1],gap=(f.columnGap??4)*PT,usable=inline-2*pad-gap*(weights.length-1),sum=weights.reduce((a,b)=>a+b,0);let columnStart=pad;
  const spans=story.spans||[],base={fontSize:f.fontSize||11,fontFamily:f.fontFamily||'serif',color:f.color||'#111111'},styles=spans.map(s=>({...base,...s.style}));
  const styleAt=i=>{const at=offset(i);let low=0,high=spans.length;while(low<high){const mid=(low+high)>>1;if(spans[mid].end<=at)low=mid+1;else high=mid;}return spans[low]?.start<=at?styles[low]:base;};
  const makeSegments=(from,to)=>{const out=[];for(let i=from;i<to;i++){if(newline(gs[i].segment))continue;const style=styleAt(i),last=out.at(-1);if(!vertical&&last&&last.style===style)last.text+=gs[i].segment;else out.push({text:gs[i].segment,style});}for(const s of out)s.width=vertical?s.style.fontSize:measure(s.text,{...f,...s.style});return out;};
  const extent=(a,b)=>makeSegments(a,b).reduce((n,s)=>n+s.width,0);
  const legal=i=>i===gs.length||newline(gs[i]?.segment)||(!noEnd.has(gs[i-1]?.segment)&&!noStart.has(gs[i]?.segment)&&!(latin(gs[i-1]?.segment||'')&&latin(gs[i]?.segment||'')));
  for(let col=0;col<weights.length&&cursor<gs.length;col++){
   const columnWidth=usable*weights[col]/sum,limit=columnStart+columnWidth;let b=pad;
   while(cursor<gs.length&&b<block-pad){
    let height=styleAt(cursor).fontSize*(f.lineHeight||1.5),intervals;
    // A larger style anywhere on a row expands its full band, including exclusions.
    for(let attempt=0;attempt<4;attempt++){
     intervals=bandIntervals(f,vertical,b,b+height,columnStart,limit);let peek=cursor,max=height;
     for(const [l,r] of intervals){let i=peek;while(i<gs.length&&!newline(gs[i].segment)&&extent(peek,i+1)<=r-l+1e-8){max=Math.max(max,styleAt(i).fontSize*(f.lineHeight||1.5));i++;}peek=i;if(newline(gs[i]?.segment))break;}
     if(max===height)break;height=max;
    }
    if(b+height>block-pad+1e-8)break;
    for(const [l,r] of intervals){
     if(cursor>=gs.length)break;const from=cursor;let end=cursor,lastBreak=cursor;
     while(end<gs.length&&!newline(gs[end].segment)&&extent(from,end+1)<=r-l+1e-8){end++;if(legal(end))lastBreak=end;}
     if(lastBreak===from&&latin(gs[from]?.segment||'')){let wordEnd=from;while(wordEnd<gs.length&&latin(gs[wordEnd].segment))wordEnd++;if(end<wordEnd&&extent(from,wordEnd)<=columnWidth+1e-8)continue;}
     if(end<gs.length&&!newline(gs[end].segment)&&lastBreak>from)end=lastBreak;
     // Long Latin words may break at a grapheme, but opening/closing marks never hang.
     while(end>from&&end<gs.length&&(noEnd.has(gs[end-1].segment)||noStart.has(gs[end].segment)))end--;
     if(end===from&&!newline(gs[end]?.segment))continue;
     const segments=makeSegments(from,end),used=segments.reduce((n,s)=>n+s.width,0),align=f.align||'left';let pen=l+(align==='center'?(r-l-used)/2:align==='right'?r-l-used:0);
     const hardBreak=newline(gs[end]?.segment);cursor=end+(hardBreak?1:0);
     for(const s of segments){s.x=vertical?f.width*PT-b-height+(height-s.style.fontSize)/2:pen;s.y=vertical?pen:b+(height-s.style.fontSize)/2;s.rotation=vertical&&(/^[\x20-\x7e]+$/.test(s.text)||'（）〔〕［］｛｝〈〉《》「」『』【】—…'.includes(s.text))?90:0;if(vertical&&'，。、．'.includes(s.text)){s.x+=s.style.fontSize*.4;s.y-=s.style.fontSize*.45;}pen+=s.width;}
     lines.push({text:story.text.slice(offset(from),offset(end)),start:offset(from),end:offset(cursor),column:col,x:vertical?f.width*PT-b-height:l,y:vertical?l:b,height,width:r-l,segments});
     if(hardBreak)break;
    }
    b+=height;
   }
   columnStart=limit+gap;
  }
  runs.push({frameId:f.id,start:offset(start),end:offset(cursor),lines});
 }
 return {runs,overset:story.text.slice(offset(cursor)),offset:offset(cursor)};
}
