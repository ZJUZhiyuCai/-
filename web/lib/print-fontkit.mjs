import fontkit from '@pdf-lib/fontkit';

export function cffFdForGlyph(select,gid){
  if(!select)return null;
  if(select.version===0)return select.fds[gid];
  if(![3,4].includes(select.version)||!Number.isInteger(gid)||gid<0||gid>=select.sentinel)throw Error('CFF_FDSELECT_INVALID');
  // Ranges are [first, nextFirst), including the first glyph of each range.
  let low=0,high=select.ranges.length-1,found=-1;
  while(low<=high){const mid=(low+high)>>1;if(select.ranges[mid].first<=gid){found=mid;low=mid+1;}else high=mid-1;}
  if(found<0)throw Error('CFF_GLYPH_FD_MISSING');
  return select.ranges[found].fd;
}

// Adapter for the pinned @pdf-lib/fontkit 1.1.1 CFF subsetter. It assigns an
// already-seen source FD to the *last* subset FD and collects local subroutines
// into that same wrong dictionary. Mixed CJK/Latin input revisits FDs and can
// produce missing/broken ink even though ToUnicode text extraction succeeds.
// Keep the fix per subset instance; do not mutate the package or global fontkit.
export function subsetCidFontdict(subset,topDict){
  const fdMap=new Map(),usedSubrs=[];
  topDict.FDArray=[];topDict.FDSelect={version:0,fds:[]};
  for(const gid of subset.glyphs){
    const sourceFd=subset.cff.fdForGlyph(gid);
    if(sourceFd==null)throw Error('CFF_GLYPH_FD_MISSING');
    let targetFd=fdMap.get(sourceFd);
    if(targetFd===undefined){
      targetFd=topDict.FDArray.length;fdMap.set(sourceFd,targetFd);
      topDict.FDArray.push({...subset.cff.topDict.FDArray[sourceFd]});usedSubrs.push({});
    }
    topDict.FDSelect.fds.push(targetFd);
    const glyph=subset.font.getGlyph(gid);
    void glyph.path; // Decode the charstring to collect its local subroutines.
    Object.assign(usedSubrs[targetFd],glyph._usedSubrs);
  }
  topDict.FDArray.forEach((dict,index)=>{
    delete dict.FontName;
    if(dict.Private?.Subrs)dict.Private={...dict.Private,Subrs:subset.subsetSubrs(dict.Private.Subrs,usedSubrs[index])};
  });
}

export default {
  create(...args){
    const font=fontkit.create(...args);
    if(font.directory?.tables?.['CFF ']){
      const cff=font['CFF '];
      cff.fdForGlyph=gid=>cffFdForGlyph(cff.topDict.FDSelect,gid);
      const createSubset=font.createSubset.bind(font);
      font.createSubset=()=>{
        const subset=createSubset();
        if(subset.cff?.isCIDFont)subset.subsetFontdict=function(topDict){subsetCidFontdict(this,topDict);};
        return subset;
      };
    }
    return font;
  },
};
