/**
 * Pure JavaScript date utilities for '내 업무 플래너'.
 * Uses local calendar date to strictly avoid UTC offset bugs.
 */

/**
 * Returns today's date formatted as 'YYYY-MM-DD' in local timezone.
 */
export function getLocalTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats today's date in Korean.
 * e.g., "2026년 11월 3일 (화)"
 */
export function formatTodayKorean() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = days[now.getDay()];
  return `${year}년 ${month}월 ${date}일 (${dayOfWeek})`;
}

/**
 * Formats 'YYYY-MM-DD' into readable Korean string.
 */
export function formatDueDate(dateStr) {
  if (!dateStr) return '마감일 없음';

  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;

  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = days[d.getDay()] || '';

  const todayYear = new Date().getFullYear();
  if (year === todayYear) {
    return `${month}월 ${day}일 (${dayOfWeek})`;
  }
  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')} (${dayOfWeek})`;
}

/**
 * Computes exact status according to project rules:
 * - Local date comparison
 * - Today is NOT overdue
 * - Today is '오늘 마감'
 * - Earlier than today is '기한 지남' (uncompleted only)
 * - Completed tasks are excluded from '기한 지남' and '오늘 마감'
 */
export function getTaskDateStatus(task) {
  if (task.completed) {
    return {
      type: 'completed',
      badgeText: '완료됨',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      detailsText: task.dueDate ? formatDueDate(task.dueDate) : '마감일 없음',
      isOverdue: false,
      isDueToday: false,
    };
  }

  if (!task.dueDate) {
    return {
      type: 'no_date',
      badgeText: '마감일 없음',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      detailsText: '기한 없음',
      isOverdue: false,
      isDueToday: false,
    };
  }

  const today = getLocalTodayString();

  if (task.dueDate === today) {
    return {
      type: 'due_today',
      badgeText: '오늘 마감',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      detailsText: formatDueDate(task.dueDate),
      isOverdue: false,
      isDueToday: true,
    };
  }

  if (task.dueDate < today) {
    const [tY, tM, tD] = today.split('-').map(Number);
    const [dY, dM, dD] = task.dueDate.split('-').map(Number);
    const todayDate = new Date(tY, tM - 1, tD);
    const dueDate = new Date(dY, dM - 1, dD);
    const diffTime = todayDate.getTime() - dueDate.getTime();
    const diffDays = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    return {
      type: 'overdue',
      badgeText: '기한 지남',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      detailsText: `${formatDueDate(task.dueDate)} (${diffDays}일 지남)`,
      isOverdue: true,
      isDueToday: false,
    };
  }

  // Future / upcoming
  const [tY, tM, tD] = today.split('-').map(Number);
  const [dY, dM, dD] = task.dueDate.split('-').map(Number);
  const todayDate = new Date(tY, tM - 1, tD);
  const dueDate = new Date(dY, dM - 1, dD);
  const diffTime = dueDate.getTime() - todayDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const dDayLabel = diffDays === 1 ? '내일 마감 (D-1)' : `D-${diffDays}`;

  return {
    type: 'upcoming',
    badgeText: dDayLabel,
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
    detailsText: formatDueDate(task.dueDate),
    isOverdue: false,
    isDueToday: false,
  };
}

/**
 * Returns date offset string YYYY-MM-DD
 */
export function getRelativeDateString(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns next Monday's YYYY-MM-DD
 */
export function getNextMondayString() {
  const d = new Date();
  const currentDay = d.getDay();
  const distanceToMonday = (8 - currentDay) % 7 || 7;
  d.setDate(d.getDate() + distanceToMonday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
