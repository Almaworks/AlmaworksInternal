/** Bound each database projection without changing its authorization or slot predicate. */
export async function readCalendarSlotRanges<T>(from:string,until:string,read:(from:string,until:string)=>Promise<T[]>):Promise<T[]>{
  const start=Date.parse(from),end=Date.parse(until);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>90*86400000)throw new Error("Invalid Calendar range");
  const ranges:{from:string;until:string}[]=[];
  // Seven days contain at most 672 slots, below the API row limit. Align internal boundaries with 15-minute slots.
  for(let cursor=start;cursor<end;){
    const next=Math.min(end,(Math.floor(cursor/604800000)+1)*604800000);
    ranges.push({from:new Date(cursor).toISOString(),until:new Date(next).toISOString()});cursor=next;
  }
  const results:T[][]=new Array(ranges.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(2,ranges.length)},async()=>{
    while(cursor<ranges.length){const index=cursor++,range=ranges[index]!;results[index]=await read(range.from,range.until);}
  }));
  return results.flat();
}

