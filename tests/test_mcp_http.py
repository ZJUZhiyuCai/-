import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
from server import Handler

class HttpProjectTests(unittest.TestCase):
    def test_shared_projects_and_conflicts(self):
        with tempfile.TemporaryDirectory() as root:
            old=os.environ.get('SHUYE_WORKSPACE')
            os.environ['SHUYE_WORKSPACE']=root
            server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            opener=build_opener(ProxyHandler({}));url=f'http://127.0.0.1:{server.server_port}'
            def call(tool,args,origin=None):
                request=Request(url+'/api/mcp-projects',data=json.dumps({'tool':tool,'arguments':args}).encode(),headers={'Content-Type':'application/json',**({'Origin':origin} if origin else {})})
                try:
                    with opener.open(request) as response:return response.status,json.load(response)
                except HTTPError as error:
                    raw=error.read()
                    return error.code,json.loads(raw) if raw.startswith(b'{') else None
            try:
                code,r=call('create_project',{'projectId':'http-book','title':'HTTP 工程'});self.assertEqual(code,200);self.assertEqual(r['revision'],1)
                code,r=call('get_project',{'projectId':'http-book'});doc=r['document'];doc['title']='编辑器修改'
                code,r=call('replace_project',{'projectId':'http-book','expectedRevision':1,'document':doc});self.assertEqual(r['revision'],2)
                code,r=call('replace_project',{'projectId':'http-book','expectedRevision':1,'document':doc});self.assertEqual(code,400);self.assertIn('REVISION_CONFLICT',r['error'])
                self.assertEqual(call('list_projects',{},'https://unrelated.example')[0],403)
                self.assertEqual(call('export_pdf',{'projectId':'http-book'})[0],400)
                code,r=call('get_project',{'projectId':'../../outside'});self.assertEqual(code,400)
                self.assertTrue((Path(root)/'projects/http-book.json').is_file())
            finally:
                server.shutdown();server.server_close();thread.join()
                if old is None:os.environ.pop('SHUYE_WORKSPACE',None)
                else:os.environ['SHUYE_WORKSPACE']=old
