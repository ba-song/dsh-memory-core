import { partsOf } from '../adapter/timefmt.js'

const OFFSETS = Object.freeze({
  今天: 0, 今晚: 0,
  明天: 1, 明早: 1, 明晚: 1,
  昨天: -1, 前天: -2, 后天: 2,
})

/**
 * 将明确的相对日期词锚定到 at 对应的 Asia/Shanghai 本地日期。
 * 仅处理白名单词汇；不推断“上次/之前”等模糊时间表达。
 */
export function anchorRelativeTime(text, at = Date.now()) {
  const source = String(text ?? '')
  if (!source) return source
  const p = partsOf(at)
  const base = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))
  return source.replace(/前天|后天|明天|明早|明晚|昨天|今天|今晚/g, (word) => {
    const date = new Date(base + OFFSETS[word] * 86400000)
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${month}-${day}`
  })
}
