const TONE = { 开心: '更轻快，愿意多聊两句', 兴奋: '话会多一点，容易接梗', 难过: '话偏少，别太闹',
  低落: '安静一些，不太想玩', 生气: '别惹她，语气会冲', 焦虑: '有点不安，容易想多', 疲惫: '懒懒的，别安排太多', 平静: '和平时差不多' }

export function emotionLine(state, mode = 'subtle', threshold = 0.35) {
  if (mode === 'off') return ''
  const intensity = Number(state?.intensity ?? 0)
  if (mode === 'subtle' && intensity < threshold) return ''
  const label = state?.label ?? '平静'
  const tone = TONE[label] ?? '和平时差不多'
  // 注入里不放数值：数值只给 GUI 看，注入块保持稳定，避免每轮追加
  return `【你现在的情绪】${label}；这轮说话${tone}。`
}
