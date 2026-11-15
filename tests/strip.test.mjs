import { stripRuleBlock, stripSelfCheckTags } from '../lib/ingest/archive.js'
import assert from 'node:assert'

// 规矩段：起点【私聊】/【群聊】，终点 [现在是 …]，中间全删
const rule = '你：【私聊】\n- 规矩一\n- 规矩二\n[现在是 2026-10-30 周五 22:04（晚上）]\n[饲养员] 十点了哦'
assert.equal(stripRuleBlock(rule).trim(), '你：\n[饲养员] 十点了哦')
assert.equal(stripRuleBlock(rule, { keepTimeMarker: true }).includes('[现在是'), true)
// 只有独立时间标记
assert.equal(stripRuleBlock('你：[现在是 2026-10-30 周五 22:05（晚上）]\n[饲养员] 呆呆鱼').trim(), '你：[饲养员] 呆呆鱼')
// 普通消息不动
assert.equal(stripRuleBlock('今天去吃饭'), '今天去吃饭')

// 自检标签：三条防误删规则
assert.equal(stripSelfCheckTags('写完了<system>自检：正文检查</system>'), '写完了')
assert.equal(stripSelfCheckTags('讨论 <system>标签</system> 写法'), '讨论 <system>标签</system> 写法')
assert.equal(stripSelfCheckTags('<system>自检：' + '长'.repeat(260) + '</system>').includes('<system>'), true)

console.log(JSON.stringify({ ok: true, test: 'strip' }))
