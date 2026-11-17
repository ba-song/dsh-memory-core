/**
 * M1：通用偏好持久性分类。
 * 只把用户明确表达为长期/反复适用的偏好标记为可持久化；
 * 临时要求与没有明确持久性证据的内容不升级为长期偏好。
 * 不包含任何具体偏好主题或表达风格词表。
 */
const TEMPORARY = /这次|这回|今天|今晚|明天|现在|暂时|先这样|这几天|最近一阵|当前这轮|这一轮|临时|一会儿|等下|待会/;
const DURABLE = /长期以来|长期|从今以后|以后(?:都|每次|每回)|往后(?:都|每次|每回)|今后(?:都|每次|每回)|每次都|每回都|一直|始终|一贯|持续/;

/**
 * @returns {{persistence:'temporary'|'long_term'|'unspecified',persist:boolean,category:'user_preference',text:string,reason:string}}
 */
export function classifyPreference(sourceText, candidateText = '') {
  const source = String(sourceText ?? '').trim();
  const candidate = String(candidateText ?? '').trim();
  if (!source || !candidate) return { persistence: 'unspecified', persist: false, category: 'user_preference', text: candidate, reason: 'empty' };
  if (TEMPORARY.test(source)) return { persistence: 'temporary', persist: false, category: 'user_preference', text: candidate, reason: 'temporary-marker' };
  if (DURABLE.test(source)) return { persistence: 'long_term', persist: true, category: 'user_preference', text: candidate, reason: 'explicit-durable-marker' };
  return { persistence: 'unspecified', persist: false, category: 'user_preference', text: candidate, reason: 'no-explicit-duration' };
}
