# Agent 主导的期刊排版

书页把执行单位从“点击一个工具”改为“完成一个有版本边界的任务”。人给出目标；Agent 读取结构、生成版式方案、预检并应用、生成实际 PDF、核对报告；人接管例外并审阅结果。后台执行不依赖浏览器保持打开。版式与段落面板、直接编辑和历史版本仍可使用。

## 任务入口

期刊编辑器默认打开 Agent 面板。一次“执行排版任务”明确授权本次版式调整及校样生成；不再在每个机械步骤要求点击确认。“检查现有版式”跳过模型和修改，只生成、检查当前修订的校样。项目库的“Agent 任务”汇总当前账号的任务，可以从其他页面返回继续查看。

运行时可“停止并接管”。停止发生在步骤边界；已经提交的原子修改保留，可整次撤销。已启动的 PDF 编译可以继续完成，续接会取回这份结果。校样就绪后展示实际修改值和页数。用户可查看报告、下载 PDF，完成逐页审阅后记录“完成本轮审阅”。审阅记录绑定具体修订与 PDF SHA-256，不表示正式发印批准。

![Agent 任务：当前待审阅结果与历史记录](images/agent-workflow-board.png)

![编辑器：实际改动与校样优先，人工工具随时可用](images/agent-workflow-result.png)

## 外部 Agent 契约

先查询 `get_agent_capabilities` 与 `get_layout_assistant`。独立服务配置 journal 后支持 `mode=proof` 校样任务；配置 assistant 后才支持 `mode=layout` 模型排版任务。`modes`、`proofReady` 与 `layoutModelConfigured` 返回实际配置范围，模型即时可用性仍以 `get_layout_assistant.ready` 为准。Workers 仍提供结构化编辑工具，不宣称能运行本机模型或 TeX。低层工具保留，用于外部 Agent 自行规划内容和结构修改。

| 工具 | 作用 |
| --- | --- |
| `get_agent_capabilities` | 实际执行范围、持久化、恢复和并发能力 |
| `start_agent_task` | 提交目标，返回持久化任务 ID |
| `get_agent_task` | 读取真实步骤、修改差异、校样证据、例外与下一步 |
| `list_agent_tasks` | 本人未归档工程最近任务；可按 projectId 查询指定工程历史，最多 50 条 |
| `cancel_agent_task` | 停止后续步骤，保留已发生的修改 |
| `resume_agent_task` | 校验修订后从检查点继续，不重复已应用的版式 |
| `undo_agent_task` | 恢复任务前文稿，产生新修订；拒绝覆盖后续编辑 |
| `review_agent_task` | 按用户指示记录本轮审阅，必须提供修订与 PDF SHA |

例如，通过现有 HTTP MCP `tools/call` 下达任务：

```json
{
  "name": "start_agent_task",
  "arguments": {
    "projectId": "your-project",
    "expectedRevision": 1,
    "requestId": "f490cf83-6733-4771-9d5b-190f8002cbb4",
    "goal": "正文改为双栏，栏距6毫米，字号9pt，其他参数保持不变。",
    "mode": "layout"
  }
}
```

每个新任务生成新的 UUID；超时、断线或未知提交结果时重试**同一个 requestId 与参数**。相同请求返回原任务，不重复修改；同键不同参数拒绝。响应的 `actions` 和 `nextAction` 用于决定后续操作，`events` 是工具阶段记录，不是模型思维链。轮询 `get_agent_task`，不要再次创建任务来检查进度。

需要更细的操作时，用 `get_project_context` 获取有界结构摘要，再按稳定 ID 使用 `list_components`、`apply_changes` + `dryRun:true`；提交必须携带当前 `expectedRevision`。校样的实际对象坐标使用 `get_journal_proof_page` 读取。大图和完整文稿不应每次轮询传输；任务查询只读版本元数据和有界任务记录。

## 状态与恢复

- `running`：后台正在执行，关闭页面不会停止。
- `needs_attention`：目标歧义、修订冲突、环境失败、质量阻断或重启。`issue.code` 和 `actions.resume` 区分可直接续接与需要处理的问题。
- `cancelled`：已停止；没有后续改稿时可继续原任务。
- `review`：实际 PDF 已生成且没有机器检查的 error 阻断，等待审阅。报告仍可能为 INCOMPLETE。
- `accepted`：本轮审阅已记录，源文件和质量报告不因该动作改变。
- `undone`：本任务已恢复，旧校样保留为历史，不能再作为当前版本下载。

全局同时执行一个连续任务；模型和 TeX 还保留自身的资源限制；已有任务短暂占用资源时自动等待，仍受任务总时限约束。任务最多保留 1000 条，每条最多执行 5 次，每次最长 8 分钟。每次状态写入使用私有文件原子替换。没有自动清理；管理员按保留策略维护数据。

启动时把遗留运行任务标为中断。正常检查点可显式继续；若服务在提交写入时异常退出而不能证明提交结果，则标记 `COMMIT_OUTCOME_UNKNOWN`，禁止盲目重放。记录、当前源修订和摘要供用户核对后新建任务。已应用版本上的后续人工或其他 Agent 修改，会阻断旧任务继续或撤销。

## 能力边界与验收

内置模型目前仅调整页面宽高、四边距、栏数、栏距、字号和行距。正文、公式、图表和首面角色不由这条任务自动改写；仅结构统计和用户指令进入模型上下文。首面角色、科学内容和复杂自由版面可通过低层 MCP 或人工工具处理。完整任务目前面向单篇期刊；整期编排与 Word 运行时是独立能力。

机器检查不包含完整的视觉审稿、数学语义、字体许可或印厂批准。报告质量和来源摘要保留原值，不能因为任务执行完成而改为生产就绪。

回归入口：`npm test`、`npm run build`、`node standalone/build.mjs`。`tests/agent-tasks.test.mjs` 用 HTTP 模型替身与校样协议替身检查幂等、所有者隔离、取消/恢复、重启、版本竞争、质量阻断、无变化方案、只出校样与审阅绑定；这些不是模型或排版质量评测。真实模型与 PDF 另行验收。
