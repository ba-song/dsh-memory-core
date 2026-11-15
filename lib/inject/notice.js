/** 所有插件注入的 user/message 必须走这里：session v4 要求唯一 id，缺 id 会导致重载时历史打不开。 */
import { randomUUID } from 'node:crypto'

export function noticeMessage(text, summary) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: String(text ?? '') }],
    source: { kind: 'plugin:dy-memory', form: 'notice', summary: String(summary ?? '') },
  }
}
