import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startServer} from '../standalone/server.mjs';

test('forged proxy headers cannot reset the login attempt budget',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'shuye-login-abuse-'));
  const origin='http://127.0.0.1:18877';let app;
  try {
    app=await startServer({directory,publicDirectory:fileURLToPath(new URL('../public',import.meta.url)),origin,port:18877,bootstrapPassword:'test-only-adversarial-password'});
    const statuses=[];
    for(let attempt=0;attempt<12;attempt++){
      const response=await fetch(origin+'/shuye/login',{method:'POST',redirect:'manual',
        headers:{Origin:origin,'X-Real-IP':`192.0.2.${attempt+1}`,'X-Forwarded-For':`198.51.100.${attempt+1}`},
        body:new URLSearchParams({password:'wrong-test-password'})});
      statuses.push(response.status);await response.text();
    }
    assert.deepEqual(statuses,[...Array(10).fill(401),429,429]);
  } finally {await app?.close();await rm(directory,{recursive:true,force:true});}
});
