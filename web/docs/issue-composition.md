# 整期编排、目录回算与可编辑 Word（0.7.0）

在项目库点击“整期编排与 Word 导出”，加入已应用期刊模板的文章，调整刊载顺序、刊期名称、开本和正文起始页。点击保存，再生成整期校样。方案不修改单篇源稿，按每篇的修订号绑定，保留最近 20 次方案历史。选择历史方案后点击保存，会创建新的方案修订。

“取回上次任务”可读取浏览器或 MCP 创建的最近任务。生成完成后提供整期 PDF、整期 Word、逐篇 Word、质量报告和 ZIP 交付包。下载按块核对 SHA-256；方案或任一源稿更新后，旧校样默认不能下载，应重新加入修改过的文章并重排。

## Word 和目录

Word 使用原生段落、文字样式、表格、Office Math、图片和脚注，保留每个源 OMML 数学树。正文与表格单元格按文本片段逐项核对，导出不是整页截图。标题、作者、章节和脚注仍可在 Word 中编辑。奇偶页眉页脚保留源工程设置，正文页码按整期连续。

目录以整期 Word 在服务器 LibreOffice Writer 中渲染的实际 PDF 书签起页为准，回填可编辑的 `PAGEREF` 字段，再渲染一遍确认分页稳定。文章另起页，目录不计入正文起始页。重新排序、改起始页或改稿后需重新生成。

Word 在不同版本 Microsoft Word、字体环境和打印设置下可能重新分页。在其他软件改 Word 后应更新域并重新校样，不能继续沿用旧 PDF 的目录验收。整期 Word/PDF 与单篇 XeLaTeX PDF 是不同排版引擎，页数不保证相同。

## MCP 调用

在线服务共有 91 个工具，连接方式见 [MCP 指南](../../docs/mcp.md)。整期新增六个工具：

| 工具 | 用途 |
| --- | --- |
| `list_issues` | 列出当前用户的方案 |
| `save_issue` | 新建/更新有序文章及源修订绑定 |
| `get_issue` | 读取方案、历史和 `latestProofId` |
| `start_issue_proof` | 异步生成整期、回算目录与 Word |
| `get_issue_proof` | 读取状态、目录、摘要、质量及过期状态 |
| `download_issue_artifact` | 按固定 artifactId 分块下载并核对摘要 |

先确认 `get_journal_capabilities` 返回 `issue.enabled: true`。以下参数使用自己工程的真实 ID 和当前修订：

```json
{
  "issueId": "issue-2026-04",
  "expectedRevision": 0,
  "plan": {
    "title": "2026 年第 4 期",
    "firstPage": 1,
    "width": 210,
    "height": 285,
    "articles": [
      {"projectId": "article-a", "revision": 2},
      {"projectId": "article-b", "revision": 5}
    ]
  }
}
```

传给 `save_issue`，使用返回修订调用 `start_issue_proof({issueId, expectedRevision})`。保存 `proofId`，每隔数秒调用 `get_issue_proof`，直到 `complete` 或 `failed`。不要重复启动以代替轮询。

`report.articles` 包含文章顺序、逻辑起止页与物理起页；`report.word` 核对源文本与公式；`quality.diagnostics` 保留缺图等阻断。取返回的 `artifacts[].id` 调用下载工具，依 `nextOffset` 拼接 base64 解码后的字节，直到 `done:true`，核对总字节数和 SHA-256。最大块为 2 MiB。过期旧稿仅在明确设置 `acknowledgeStale:true` 时可取作历史审校，不能作为新修订的校样。

完整实际客户端验收脚本为 `web/scripts/issue-acceptance.mjs`，读取外部私有清单中的源工程快照，依次测试七篇编排、下载、反向排序、101 起页、历史恢复和旧稿拒绝。清单、稿件和令牌不进入 Git。

## 运行与边界

需要独立服务器的 Python、python-docx、LibreOffice Writer、Python UNO 和中文字体，见 [部署说明](self-hosting.md)。Worker/Sites 环境不提供此原生工作进程。整期最多 50 篇，源快照合计最多 28 MiB，每用户最多 100 个方案，任务存储默认最多 200 个目录；超限明确报错。单工作进程串行执行，忙时返回 `JOURNAL_WORKER_BUSY_RETRY`，客户端稍后重试。

本次支持横排期刊模型，拒绝自由版面混排、竖排、尾注模式、注音与侧排组等未实现的 Word 表达，避免静默丢内容。正文脚注、横向/纵向合并表、重复表头和图表题注使用 Word 原生结构。超长表格和浮动组仍须看最终 PDF。

缺图保留 `BLOCKED`，无结构阻断的校样为 `REVIEW`。整期导出不替代编辑逐字签样、公式语义复核或完整 PDF/X 合规验证；下载成功不表示可以直接发印。
