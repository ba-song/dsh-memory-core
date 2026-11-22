# Agent Reviews

本目录用于保存 Memory 与 Persona 对联合数据契约的只读审查报告。

## 当前契约审查

- 契约草案：`coordination/contracts/DSHA-MEMORY-PERSONA-CONTRACT-v1.1.1-DRAFT.md`
- 审查性质：只读；不改业务代码、测试、数据库、生产配置，不部署，不合并实现。
- 报告必须由对应专业负责人直接写入 GitHub 自己的审查分支/PR。
- 不得直接写入 main；不得覆盖历史报告。
- 报告只提交到下列路径，目录可在各自审查分支中创建：

```
coordination/agent-reviews/
├── README.md
├── prompts/
│   ├── memory/
│   │   └── 13-PROMPT.md
│   └── persona/
│       └── 13-PROMPT.md
├── memory/
│   └── contract-v1.1.1/
│       └── REVIEW-REPORT.md
└── persona/
    └── contract-v1.1.1/
        └── REVIEW-REPORT.md
```

## 报告交付格式

专业负责人在 GitHub 报告中写完整证据，不在聊天中粘贴完整报告。聊天回报只需：
1. 状态（PASS / PARTIAL / BLOCKED / FAILED 等）
2. GitHub 报告路径
3. 报告 commit SHA
4. PR URL（如有）
5. 阻塞项

报告必须包含准确 HEAD、范围、逐项结论、文件路径/行号、测试命令与结果、证据、未覆盖项、风险与未决问题。无证据不得写 PASS。

提示词应保存在各自专业工作区的下一个未占用序号文件中，不覆盖历史提示词；本仓库中的 prompt 文件为可转交副本。
