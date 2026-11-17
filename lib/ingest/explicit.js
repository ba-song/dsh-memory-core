/**
 * P4-pre：显式陈述抽取（规则、保守）
 * 只认"记住/记一下/别忘了/要记得"开头的句子；其余一律不抽。
 * 自动抽取默认 fuzzy + importance 0.35 + confidence 0.6 + layer auto。
 */
import { insertMemory } from '../store/memories.js'
import { now } from '../adapter/time.js'

// 「记住…」可以是带冒号也可以是直接接内容；但"记住了哟/我记住了"这类是回应，不算指令
const CMD = /(?:^|[\s。！？!?，,])(帮我记一下|帮我记|记一下|记住|别忘了|要记得)([\s\S]*)$/
// 补发消息带 "02:06:20 " 前缀；也接受"明天记得叫我起床"这类祈使句（记得+动作）
const BACKLOG = /^\s*\d{1,2}:\d{2}(?::\d{2})?\s+/
const REMEMBER = /((?:今天|明天|后天|今晚|明早|等会|待会|晚点|回头|下午|晚上)?记得(?:叫|提醒|帮|给|买|做|带|发|问|说|看|写|交|还|去)[^\n。！？!?]{1,40})/
const MOOD_START = /^[了啦哦呀嘛呢吧啊哟哈嗯诶]/
const FILLER = /^[了啦哦呀嘛呢吧啊哟哈嗯诶，。,.!！?？\s]+$/

function normalize(text) {
  return String(text ?? '')
    .replace(BACKLOG, '')                       // 断线重连补发的 "02:06:20 "
    .replace(/^\s*\[[^\]]{1,8}\]\s*/, '')      // 开头的 [饲养员] / [主人]
    .replace(/[哦呀啦哈嘛哟]+\s*$/, '')          // 句尾语气词
}

export function extractExplicit(text) {
  // 去掉 onebot 拼进来的时间标记和聊天规矩，避免在系统提示里误匹配
  let s = normalize(text).replace(/\[\s*现在是[^\]]*\]/g, ' ')
  const start = s.search(/【(私聊|群聊)】/)
  if (start >= 0) {
    const end = s.slice(start).search(/\[\s*(?:现在是|20\d{2}-\d{2}-\d{2})[^\]]*\]/)
    if (end >= 0) s = s.slice(0, start) + s.slice(start + end)
  }
  const m = s.match(CMD)
  if (m) {
    const body = m[2].trim().replace(/^[：:，,。.\s]+/, '')
    if (body.length >= 2 && !FILLER.test(body) && !MOOD_START.test(body)) return body
  }
  const r = s.match(REMEMBER)
  if (r) {
    const body = r[1].trim()
    if (body.length >= 4 && !FILLER.test(body)) return body
  }
  return null
}

export async function ingestExplicit(db, { sessionId, seq, text, at = now(), speaker = '', scopeType = 'owner', scopeId = '' }) {
  const body = extractExplicit(text)
  if (!body) return null
  const sourceKey = `explicit:${sessionId}:${seq}`
  const dup = db.prepare("SELECT id FROM memories WHERE json_extract(meta,'$.sourceKey')=?").get(sourceKey)
  if (dup) return null
  const id = await insertMemory(db, {
    kind: /提醒|叫我|记得|待办/.test(body) ? 'todo' : 'fact', text: body, clarity: 'fuzzy', importance: 0.35, confidence: 0.6, layer: 'auto',
    speakerId: speaker, ownerScope: speaker || '', privacy: 'owner',
    scopeType, scopeId,
    sourceMsgId: sourceKey, sourceTs: at, extractorVersion: 'explicit-v1',
    // 2026-11-16 P0-1：显式路径有原文（本轮这句），引文从「抽取正文 ∩ 原文」里取最长逐字片段
    sourceText: String(text ?? ''), provenanceMode: 'session',
    meta: { sourceKey, auto: true },
  })
  return id
}
