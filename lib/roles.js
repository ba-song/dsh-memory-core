/**
 * 语义角色（阶段 3）
 *
 * 存储角色：user / self / self-thought；其余角色（具/果/错/图/文/步/量/境/压/题/待/系/撤/事）保持原样。
 * 显示名不落库：读取时按 persona.display_name / contacts.display_name 渲染；
 * 旧档案（主人/汐/汐·想，更早的 你/她/想）只做读取归一，不再写入。
 */

export const ROLE = Object.freeze({
  USER: 'user',
  SELF: 'self',
  SELF_THOUGHT: 'self-thought',
})

/** 旧标签 → 语义角色（兼容期双读；不落表，只是代码常量） */
export const ROLE_ALIASES = Object.freeze({
  主人: ROLE.USER,
  你: ROLE.USER,
  汐: ROLE.SELF,
  她: ROLE.SELF,
  '汐·想': ROLE.SELF_THOUGHT,
  想: ROLE.SELF_THOUGHT,
})

/** 语义角色 → 默认显示名（取不到 persona/contacts 时兜底；与 md 历史前缀一致） */
export const ROLE_DISPLAY_FALLBACK = Object.freeze({
  [ROLE.USER]: '主人',
  [ROLE.SELF]: '汐',
  [ROLE.SELF_THOUGHT]: '汐·想',
})

const DIALOG = new Set([ROLE.USER, ROLE.SELF, ROLE.SELF_THOUGHT])

/** 归一：旧/新/未知都能安全返回（未知原样返回，不猜测） */
export function normalizeRole(role) {
  const r = String(role ?? '')
  return ROLE_ALIASES[r] ?? r
}

/** 是否对话角色（主人/汐/汐·想 三种） */
export function isDialogRole(role) {
  return DIALOG.has(normalizeRole(role))
}

/**
 * 渲染显示名。优先级：显式传入 → 兜底常量 → 原值。
 * 改名不影响 id：这里只影响显示，不改任何存储。
 */
export function roleDisplay(role, { displayName = '', ownerName = '' } = {}) {
  const r = normalizeRole(role)
  if (r === ROLE.SELF_THOUGHT) {
    const name = String(displayName ?? '').trim() || ROLE_DISPLAY_FALLBACK[ROLE.SELF]
    return `${name}·想`
  }
  if (r === ROLE.SELF) return String(displayName ?? '').trim() || ROLE_DISPLAY_FALLBACK[ROLE.SELF]
  if (r === ROLE.USER) return String(ownerName ?? '').trim() || ROLE_DISPLAY_FALLBACK[ROLE.USER]
  return String(role ?? '')
}

/** 写 md 行前缀时用的稳定显示标签（档案保持人可读，不随改名变） */
export function archiveLabel(role) {
  const r = normalizeRole(role)
  return ROLE_DISPLAY_FALLBACK[r] ?? String(role ?? '?')
}

/** SQL 里要匹配的取值集合（兼容新旧，读路径用） */
export function roleSqlValues() {
  return [ROLE.USER, ROLE.SELF, ROLE.SELF_THOUGHT, '主人', '汐', '汐·想', '你', '她', '想']
}
