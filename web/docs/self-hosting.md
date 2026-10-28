# 独立服务器部署

书页可运行于自己的 Linux 服务器，不需要 ChatGPT Sites、Cloudflare D1/R2 或 ChatGPT 登录。当前维护者地址是 https://inkq.online/shuye/ 。原 Sites 部署继续保留；两边的后续编辑不会自动同步。

当前自托管版本为**单人私有工作区**：管理员密码登录，工程不向访客公开；可以创建多个独立 MCP 令牌。它尚不提供公开注册、多租户管理或 OAuth 授权服务器。账号密码与 SSH 密码无关。

## 构建与运行

构建机使用 Node 24、`npm ci`，在 web 目录运行 `node standalone/build.mjs`。输出在 `.sites-runtime/standalone/`，包括服务器 ESM 包、原编辑器、项目库及第三方许可，运行服务器不必安装 node_modules。运行时要求 Node 22.13+；本次实际部署验证 Node 22.22.0。

将输出复制到独立发布目录，例如 `/opt/shuye/releases/<version>/`。文件权限 644、目录 755，由 root 拥有；`/opt/shuye/current` 可作为指向版本目录的符号链接。服务使用无登录权限的专用用户，数据目录 `/var/lib/shuye` 由该用户拥有并设为 700。

配置文件放在 `/etc/shuye/config.json`，禁止提交 Git、禁止置于网站静态目录；仅 root 与服务用户可读（640）：

```json
{
  "directory": "/var/lib/shuye",
  "publicDirectory": "/opt/shuye/current/public",
  "origin": "https://your-domain.example",
  "basePath": "/shuye",
  "port": 8789,
  "bootstrapPassword": "首次启动前设置独立随机密码，至少12字符"
}
```

运行 `SHUYE_CONFIG=/etc/shuye/config.json node /opt/shuye/current/server.mjs`。服务只监听 127.0.0.1。首次启动写入 scrypt 密码摘要后，应删除配置中的 `bootstrapPassword`；已有账号启动不再需要它。请勿使用示例占位密码。

systemd 建议：专用 User/Group，WorkingDirectory 指向 current，Restart=on-failure，UMask=0077，NoNewPrivileges=true，PrivateTmp=true，ProtectHome=true，ProtectSystem=strict，ReadWritePaths 仅允许数据目录，并配置合理的内存限制。

## 域名与 Nginx

使用现有 HTTPS 证书。在已有 server 段加入独立路径，保留其他业务配置：

```nginx
location = /shuye { return 308 /shuye/; }
location ^~ /shuye/ {
    proxy_pass http://127.0.0.1:8789;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 180s;
    client_max_body_size 30m;
    add_header X-Shuye-Deployment standalone always;
}
```

`proxy_pass` 后不能加 `/`，以保留 `/shuye` 前缀。配置的 origin 必须与外部 HTTPS 地址一致。该 location 自身声明 add_header，避免继承现有首页不适用于编辑器的 CSP；安全响应头由书页服务返回。执行 `nginx -t` 成功后 reload。备份旧配置后再修改，失败恢复旧配置。

## 账号与 Agent

登录页使用本站密码。项目库的“Agent 与 MCP → 账号与 MCP 令牌设置”可修改密码、创建及撤销令牌。密码变更会使浏览器会话失效；MCP 令牌可单独撤销。会话有效期七天，使用 HttpOnly、SameSite=Strict 及 HTTPS Secure Cookie。密码登录有失败次数限制。

Agent 使用 `https://your-domain.example/shuye/mcp`，请求头为 `Authorization: Bearer <令牌>`。本分支提供 97 个 MCP 工具；其中全文期刊能力须额外启用运行时，不能从工具数量推断已可编译。令牌只在创建时显示一次，数据库只存摘要。不要将令牌放进 URL、Git 仓库或浏览器前端代码。服务拒绝伪造身份头、跨源请求；浏览器写请求必须携带同源 Origin。

## 可选的全文期刊引擎

含复杂公式的 DOCX 导入、首面模板、段落锚点和全文 PDF 使用可选 Python/XeLaTeX 引擎。安装和 `journal` 配置见 [全文期刊生产链](journal-production.md)。未配置时编辑器保留，相关能力返回不可用；Workers 环境不启用本机 TeX。

启用后，完整备份还须包含数据目录下的 `journal-proofs/`：源工程快照、PDF、编译证据与报告按源修订绑定。不要把它暴露为静态网站或只备份 PDF。依赖和证据需要额外磁盘空间；上线前重新测量容量并保留旧版本回滚。

## 可选的本机排版助手

在服务器配置中添加 `assistant`，指定本机 Ollama 地址及已安装模型；详见 [AI 排版工作台](ai-workbench.md)。默认关闭，Workers 不启用本机推理。完整备份须包含私有数据目录的 `layout-plans/`（用户要求、模型身份、参数差异及应用/撤销记录），不要将其暴露为静态网站。

## 整期 Word 运行时

0.7.0 整期输出需要 `journal-engine/requirements.txt` 中的 python-docx 1.2.0，以及 LibreOffice Writer、`python3-uno`、FreeSerif 和 Noto Serif/Sans CJK SC 字体。UNO Python 默认为 `/usr/bin/python3`，可用 `journal.env.SHUYE_UNO_PYTHON` 指定。`get_journal_capabilities.issue.enabled` 检查依赖是否可用；实际输出仍以任务状态及报告为准。

七篇含大图稿件实测须将 Shuye 服务 `MemoryMax` 至少设为 `2G`；为系统和其他服务留足余量。仍只运行一个期刊任务，整期超时至少 900 秒。整期方案、20 次方案历史与交付物都在私有 `journal-proofs/` 内，备份时一并保留。禁止将此目录直接暴露为静态下载。源快照总量限制 28 MiB；下载每块最大 2 MiB。

## 数据、备份与更新

`shuye.sqlite` 保存工程索引、十次版本指针、账号及会话；`objects/` 保存不可变 JSON 文稿。索引更新使用修订号比较，文件写入使用临时文件及原子重命名。保留现有云端冲突、恢复及响应不确定时保护稿件的逻辑。

更新时只替换发布目录及 current 链接，**不要覆盖数据目录**。备份时暂停服务，完整备份数据目录（含 SQLite 及对象），再启动并检查 `/shuye/healthz`。恢复时同样停止服务，整体恢复备份并检查服务用户与权限。生产服务不提供后台永久删除接口。

旧 Sites 文稿需要经所有者授权后导出/导入，不能只复制网页资源。此次授权迁移的是一个 r1 工程，迁移前后 document 逐字段完全相等，旧站原件保留。更多历史版本或其他用户的数据迁移需要另外处理。

## 实际验证

2026-10-19：已部署 PR #3，启用全文期刊引擎，完成正式 HTTPS/MCP、浏览器下载、CFF 中文 PDF、版本保护及服务重启验收。具体提交、环境、数据备份和证据见 [部署与线上测试记录](deployment-20261019.md)。下面 2026-10-17 的数据为首次部署历史记录。

2026-10-17：127 项 Node 自动测试通过，包含独立登录、错误密码、CSRF、伪造身份、令牌鉴权/撤销、密码更新使会话失效、路径穿越拒绝、真实 HTTP 保存/冲突/恢复、重启持久化与资源子路径。

在实际服务器关闭客户端代理后，验证 HTTPS、独立登录、项目迁移一致性、76 个 MCP 工具、旧首页正常。真实服务已输出嵌入字体和 ICC 转换的一页 PDF，独立受限预检 76 项通过；这不等于完整 PDF/X ISO 合规认证。

浏览器实际验收：本站密码登录、迁移工程列表、新建文稿、编辑器打开、修改书名保存、历史版本列表和确认恢复全部通过；恢复后标题回到初始值，并显示“历史版本已恢复”。服务经 systemd 重启后，浏览器保存的修订仍可读取。运行包与本地构建 SHA-256 一致；已设置开机启动。截图保存在维护者本地验收目录，不包含账号密码。

2026-10-17 的部署使用约 7 MB 发布文件，当时服务器剩余磁盘空间不足 500 MB；这是历史观测，不是本分支部署后的容量证明。新增原生期刊依赖前须重新测量并扩容。长期磁盘配额、自动备份轮换及多人账号系统尚未实现。
