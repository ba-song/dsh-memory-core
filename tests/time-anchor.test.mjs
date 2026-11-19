import test from 'node:test'
import assert from 'node:assert/strict'
import { anchorRelativeTime } from '../lib/time/anchor.js'

const at = Date.UTC(2026, 10, 17, 4, 8) // Asia/Shanghai: 2026-11-17 12:08

test('相对日期按写入时的上海本地日期锚定', () => {
  assert.equal(anchorRelativeTime('主人明天打算炒五花肉', at), '主人11-18打算炒五花肉')
  assert.equal(anchorRelativeTime('今天和今晚', at), '11-17和11-17')
  assert.equal(anchorRelativeTime('明天、明早、明晚', at), '11-18、11-18、11-18')
  assert.equal(anchorRelativeTime('昨天和前天', at), '11-16和11-15')
  assert.equal(anchorRelativeTime('后天', at), '11-19')
})

test('不推断白名单以外的时间表达，只替换明确相对词', () => {
  assert.equal(anchorRelativeTime('上次和之前都没说日期', at), '上次和之前都没说日期')
  assert.equal(anchorRelativeTime('明天之后再说上次的事', at), '11-18之后再说上次的事')
  assert.equal(anchorRelativeTime('', at), '')
})
