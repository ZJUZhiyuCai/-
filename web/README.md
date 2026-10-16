# 书页 · 在线出版工作台

独立开源的中文图书排版网站。产品方向参照方正飞翔印刷版 9.0-1794，当前实现流式排版及云端协作基础，**尚未达到飞翔完整功能对等**。

## 使用

登录网站 → 新建图书/学术/竖排项目 → 编辑纸面或组件属性 → 保存到云端 → 下载 JSON 备份或浏览器打印 PDF。云端版本保存最近十次可恢复历史。归档可恢复，不删除文稿。

支持文字样式、章节、1–4 栏、横竖排、奇偶页眉页脚、图片绕排、表格合并、数学公式、注音、脚注尾注、文献引用、批注、目录索引。Word 导入在浏览器内进行，是有损子集，会显示提示。

## Agent / MCP

网站 `POST /mcp` 提供 41 个工具，与编辑器共享用户隔离的云端工程。通过 Sites 发布生成的个人插件连接。`list_projects` → `get_project` → `apply_changes`，修改必须携带 `expectedRevision`，可先使用 `dryRun:true`。所有操作按稳定组件 ID 定位，无 computer-use 依赖。

文稿保存在 R2，用户/工程索引、当前修订和历史指针在 D1。服务端从部署平台注入的身份读取用户 ID，不接收请求体中的用户 ID。普通部署必须在可信网关中去除外部伪造身份头，再注入验证后的身份；不得将 Worker 直接裸露后信任任意客户端提供的身份头。

## 开发与验证

Node 22.13+（完整自动测试使用 Node 24 的 `node:sqlite`），npm ci，npm test，npm run build。Windows 若 npm.cmd 路径解析失败，可用 `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run build`。

本地数据库：首次构建后，使用 `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_regular_quasimodo.sql`。仅初始化一次。随后 npm run dev，在输出的本地地址登录测试账号。

`npm run test:http` 针对正在运行的本地服务验证真实 HTTP MCP、D1/R2 与冲突拒绝。生产部署由 Sites 工作流构建和发布；schema migration 自动应用。已应用的迁移不可修改，新增表结构需要追加迁移。

参见 [验收记录](docs/web-acceptance.md)、[飞翔功能矩阵](docs/feixiang-matrix.md)、[框架运行说明](docs/framework-runtime.md)。

## 限制

单工程 20 MB；列表最多 200 个工程。当前没有自由图文框串接、母版/图层、飞翔原生文件、EPUB、CMYK/PDF-X/PS、专业拼版或生产级多用户同时编辑合并。PDF 为浏览器打印，不能承诺跨设备字体与分页一致。历史旧对象为恢复保留，暂未实现存储垃圾回收。项目数限制在并发创建时不是严格配额。

MIT。仅包含独立源代码与声明的第三方依赖，不包含方正程序、字库或用户稿件。第三方许可见 THIRD_PARTY_NOTICES.md 和 build/sites-vite-plugin.LICENSE。
