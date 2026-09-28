import test from 'node:test';
import assert from 'node:assert/strict';
test('deployed worker bundle authenticates before any provider or storage work',async()=>{
  let handler:((request:Request)=>Promise<Response>)|undefined;
  Object.assign(globalThis,{Deno:{env:{toObject:()=>({CALENDAR_CRON_SECRET:'x'.repeat(32)})},serve:(fn:typeof handler)=>{handler=fn;}}});
  // The generated bundle is the actual deployment artifact.
  const path=new URL('../../supabase/functions/calendar-worker/index.js',import.meta.url).href;
  await import(path);
  assert.ok(handler);
  assert.equal((await handler(new Request('http://localhost',{method:'GET'}))).status,405);
  assert.equal((await handler(new Request('http://localhost',{method:'POST'}))).status,401);
  assert.equal((await handler(new Request('http://localhost',{method:'POST',headers:{Authorization:`Bearer ${'x'.repeat(32)}`}}))).status,503);
});
