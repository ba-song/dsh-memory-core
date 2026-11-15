import { cleanUserUtterance } from '../lib/ingest/utterance.js'
import assert from 'node:assert'

// A) 用户话在前，规矩在后
const a = '[饲养员] 今天好累啊，好困\n\n【私聊】\n- 这是两个人的对话\n你正在用 QQ 跟人聊天，不是在写代码\n- 别贴文件路径'
assert.equal(cleanUserUtterance(a), '今天好累啊，好困')

// B) 规矩在前，时间标记 + 用户话在后
const b = '【私聊】\n- 规矩…\n[现在是 2026-10-31 03:16]\n[饲养员] 但还是有点担心明天的事'
assert.equal(cleanUserUtterance(b), '但还是有点担心明天的事')

// C) 多条用户话合并（中间夹 [话头]）
const c = '[饲养员] 不过刚刚刷到一个超好笑的视频，哈哈哈\n\n[饲养员] 但还是有点担心明天的事\n\n[话头] 别念出来'
assert.equal(cleanUserUtterance(c), '不过刚刚刷到一个超好笑的视频，哈哈哈\n但还是有点担心明天的事')

// D) 断线补发（无前缀）
assert.equal(cleanUserUtterance('02:06:20 明天记得叫我起床哦'), '02:06:20 明天记得叫我起床哦')

// E) CQ 码去掉
assert.equal(cleanUserUtterance('[饲养员] 看我发的图[CQ:image,file=x]'), '看我发的图')

console.log(JSON.stringify({ ok: true, test: 'utterance' }))
