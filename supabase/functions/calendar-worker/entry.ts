// Built using scripts/build-calendar-edge.mjs from the same workers as Next.js.
import {Buffer} from 'node:buffer';
import {calendarConfiguration} from '../../../src/calendar/config.ts';
import {createCalendarRepositories} from '../../../src/calendar/repository.ts';
import {runCalendarSyncBatch} from '../../../src/calendar/sync-worker.ts';
import {runCalendarHoldBatch} from '../../../src/calendar/hold-worker.ts';
import {runCalendarDisconnectBatch} from '../../../src/calendar/disconnect-worker.ts';
import {drainCalendarWork,handleCalendarWorker} from '../../../src/calendar/worker-endpoint.ts';
declare const Deno:{env:{toObject():Record<string,string>};serve(handler:(request:Request)=>Promise<Response>):void};
Object.assign(globalThis,{Buffer});
Deno.serve(async request=>{
  if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
  const env=Deno.env.toObject();
  return handleCalendarWorker(request,{secret:env.CALENDAR_CRON_SECRET??null,run:async()=>{
    const config=calendarConfiguration(env);if(!config)throw new Error('Calendar setup unavailable');
    const repositories=await createCalendarRepositories(config);
    const common={oauth:config.oauth,encryptionKey:config.encryptionKey,limit:1};
    return drainCalendarWork({budgetMilliseconds:45000,
      sync:()=>runCalendarSyncBatch({...common,repository:repositories.sync}),
      holds:()=>runCalendarHoldBatch({...common,repository:repositories.holds}),
      disconnect:()=>runCalendarDisconnectBatch({limit:1,repository:repositories.disconnect})});
  }});
});
