import React from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '../app/dashboard';
import {sitePath} from '../public/editor/src/site-path.mjs';
const root=createRoot(document.getElementById('root')!);
fetch(sitePath('/api/session')).then(r=>{if(!r.ok)throw Error('无法读取登录状态');return r.json();}).then(({user})=>root.render(<Dashboard user={user}/>)).catch(()=>root.render(<p>暂时无法连接服务器，请刷新重试。</p>));
