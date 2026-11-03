/**
 * Pure JavaScript storage utility for '내 업무 플래너'.
 * Handles localStorage persistence, corruption recovery, and error detection.
 */

export const STORAGE_KEY = 'my_work_planner_tasks_v1';
export const NOTICE_TEXT = '이 브라우저에 저장되며 다른 기기와 자동 동기화되지 않습니다.';

export function generateTaskId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Loads tasks from localStorage.
 * Does NOT seed dummy tasks; strictly returns empty array if nothing is saved.
 */
export function loadTasksFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string');
    }
    return [];
  } catch (error) {
    console.error('Failed to load tasks from localStorage:', error);
    return [];
  }
}

/**
 * Saves tasks to localStorage.
 * Detects storage failure (QuotaExceededError, security errors, etc.)
 */
export function saveTasksToStorage(tasks) {
  try {
    const serialized = JSON.stringify(tasks);
    localStorage.setItem(STORAGE_KEY, serialized);
    return { success: true };
  } catch (err) {
    console.error('localStorage save failed:', err);
    let message = '저장되지 않았습니다.';
    if (err instanceof Error) {
      if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        message = '저장공간이 부족하여 저장되지 않았습니다. 브라우저 캐시를 정리해주세요.';
      } else {
        message = `저장되지 않았습니다 (${err.message || '알 수 없는 오류'})`;
      }
    }
    return { success: false, error: message };
  }
}
