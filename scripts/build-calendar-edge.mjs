import {spawnSync} from 'node:child_process';
const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['--yes','esbuild@0.25.12','supabase/functions/calendar-worker/entry.ts','--bundle','--platform=node','--format=esm','--target=es2022','--outfile=supabase/functions/calendar-worker/index.js'],{stdio:'inherit',shell:process.platform==='win32'});
process.exit(result.status??1);
