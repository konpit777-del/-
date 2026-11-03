/**
 * Pure JavaScript Application Controller for '내 업무 플래너'
 * Manages state, event delegation, and reactive DOM rendering.
 */

import { icons } from './icons.js';
import { 
  getLocalTodayString, 
  formatTodayKorean, 
  formatDueDate, 
  getTaskDateStatus, 
  getRelativeDateString, 
  getNextMondayString 
} from './dateUtils.js';
import { 
  NOTICE_TEXT, 
  generateTaskId, 
  loadTasksFromStorage, 
  saveTasksToStorage 
} from './storage.js';

// Application State
const state = {
  tasks: loadTasksFromStorage(),
  activeFilter: 'all', // 'all' | 'pending' | 'dueToday' | 'overdue' | 'completed'
  searchQuery: '',
  sortBy: 'dueDate_asc', // 'dueDate_asc' | 'createdAt_desc' | 'priority_desc' | 'title_asc'
  selectedPriority: 'medium', // default priority: 보통
  selectedDueDate: '',
  storageError: null,
  editingTask: null,
  lastDeletedTask: null,
  undoTimer: null,
};

// DOM Element References
const elements = {
  headerLogoIcon: document.getElementById('header-logo-icon'),
  headerCalIcon: document.getElementById('header-cal-icon'),
  todayDateText: document.getElementById('today-date-text'),
  footerDateText: document.getElementById('footer-date-text'),
  noticeContainer: document.getElementById('notice-container'),
  inputSectionIcon: document.getElementById('input-section-icon'),
  newTaskForm: document.getElementById('new-task-form'),
  taskTitleInput: document.getElementById('task-title-input'),
  taskTitleError: document.getElementById('task-title-error'),
  taskTitleErrorIcon: document.getElementById('task-title-error-icon'),
  taskTitleErrorText: document.getElementById('task-title-error-text'),
  prioritySelector: document.getElementById('priority-selector'),
  taskDuedateInput: document.getElementById('task-duedate-input'),
  btnClearDate: document.getElementById('btn-clear-date'),
  quickDateButtons: document.getElementById('quick-date-buttons'),
  btnSubmitIcon: document.getElementById('btn-submit-icon'),
  summarySection: document.getElementById('summary-section'),
  listSectionIcon: document.getElementById('list-section-icon'),
  taskCountBadge: document.getElementById('task-count-badge'),
  filterBarContainer: document.getElementById('filter-bar-container'),
  taskListContainer: document.getElementById('task-list-container'),
  undoToastContainer: document.getElementById('undo-toast-container'),
  editModalContainer: document.getElementById('edit-modal-container'),
};

/**
 * Persists tasks to localStorage and handles errors.
 */
function persistTasks(newTasks) {
  state.tasks = newTasks;
  const result = saveTasksToStorage(newTasks);
  if (!result.success) {
    state.storageError = result.error || '저장되지 않았습니다.';
  } else {
    state.storageError = null;
  }
  render();
  return result.success;
}

/**
 * Adds a new task.
 */
function handleAddTask(title, priority, dueDate) {
  const newTask = {
    id: generateTaskId(),
    title,
    priority,
    dueDate: dueDate || null,
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  const newTasks = [newTask, ...state.tasks];
  return persistTasks(newTasks);
}

/**
 * Toggles completion status of a task.
 */
function handleToggleComplete(id) {
  const newTasks = state.tasks.map((t) => {
    if (t.id === id) {
      const nextCompleted = !t.completed;
      return {
        ...t,
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString() : null,
      };
    }
    return t;
  });
  persistTasks(newTasks);
}

/**
 * Edits an existing task.
 */
function handleSaveEdit(id, newTitle, newPriority, newDueDate) {
  const newTasks = state.tasks.map((t) => {
    if (t.id === id) {
      return {
        ...t,
        title: newTitle,
        priority: newPriority,
        dueDate: newDueDate || null,
      };
    }
    return t;
  });
  state.editingTask = null;
  persistTasks(newTasks);
}

/**
 * Deletes only the selected task and sets up undo.
 */
function handleDeleteTask(id) {
  const targetIndex = state.tasks.findIndex((t) => t.id === id);
  const targetTask = state.tasks[targetIndex];
  if (!targetTask) return;

  const newTasks = state.tasks.filter((t) => t.id !== id);
  persistTasks(newTasks);

  state.lastDeletedTask = { task: targetTask, index: targetIndex };

  if (state.undoTimer) {
    clearTimeout(state.undoTimer);
  }
  state.undoTimer = setTimeout(() => {
    state.lastDeletedTask = null;
    renderUndoToast();
  }, 4500);

  renderUndoToast();
}

/**
 * Restores the deleted task.
 */
function handleUndoDelete() {
  if (!state.lastDeletedTask) return;
  const restoredTasks = [...state.tasks];
  restoredTasks.splice(state.lastDeletedTask.index, 0, state.lastDeletedTask.task);
  persistTasks(restoredTasks);
  state.lastDeletedTask = null;
  if (state.undoTimer) {
    clearTimeout(state.undoTimer);
  }
  renderUndoToast();
}

/**
 * Filters and sorts tasks based on active criteria.
 */
function getFilteredAndSortedTasks() {
  const today = getLocalTodayString();
  let list = [...state.tasks];

  // 1. Filter
  if (state.activeFilter === 'pending') {
    list = list.filter((t) => !t.completed);
  } else if (state.activeFilter === 'dueToday') {
    list = list.filter((t) => !t.completed && t.dueDate === today);
  } else if (state.activeFilter === 'overdue') {
    list = list.filter((t) => !t.completed && t.dueDate && t.dueDate < today);
  } else if (state.activeFilter === 'completed') {
    list = list.filter((t) => t.completed);
  }

  // 2. Search
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.trim().toLowerCase();
    list = list.filter((t) => t.title.toLowerCase().includes(q));
  }

  // 3. Sort
  list.sort((a, b) => {
    if (state.sortBy === 'dueDate_asc') {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (state.sortBy === 'createdAt_desc') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (state.sortBy === 'priority_desc') {
      const weights = { high: 3, medium: 2, low: 1 };
      const diff = weights[b.priority] - weights[a.priority];
      if (diff !== 0) return diff;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return 0;
    }
    if (state.sortBy === 'title_asc') {
      return a.title.localeCompare(b.title, 'ko');
    }
    return 0;
  });

  return list;
}

/**
 * Calculates counts for each filter category.
 */
function getFilterCounts() {
  const today = getLocalTodayString();
  const all = state.tasks.length;
  const completed = state.tasks.filter((t) => t.completed).length;
  const pending = all - completed;
  const dueToday = state.tasks.filter((t) => !t.completed && t.dueDate === today).length;
  const overdue = state.tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < today).length;
  return { all, completed, pending, dueToday, overdue };
}

// ==========================================
// RENDER FUNCTIONS
// ==========================================

function renderNoticeBanner() {
  const errorHtml = state.storageError
    ? `<div role="alert" class="flex items-start justify-between gap-3 p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs sm:text-sm font-medium animate-fadeIn mb-2">
        <div class="flex items-center gap-2">
          ${icons.alertTriangle}
          <span>${state.storageError}</span>
        </div>
        <button type="button" id="btn-dismiss-storage-error" class="text-xs font-semibold text-rose-700 hover:text-rose-900 underline shrink-0 cursor-pointer">닫기</button>
      </div>`
    : '';

  const noticeHtml = `
    <div class="flex items-center justify-between gap-3 p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs text-slate-600">
      <div class="flex items-center gap-2">
        <span class="text-blue-600 shrink-0">${icons.hardDrive}</span>
        <span class="font-medium text-slate-700">${NOTICE_TEXT}</span>
      </div>
      <span class="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400">
        ${icons.shieldCheck}
        <span>로컬 저장소 활성화됨</span>
      </span>
    </div>
  `;

  elements.noticeContainer.innerHTML = errorHtml + noticeHtml;

  const btnDismiss = document.getElementById('btn-dismiss-storage-error');
  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      state.storageError = null;
      renderNoticeBanner();
    });
  }
}

function renderPrioritySelector() {
  const priorities = [
    { id: 'high', label: '높음', icon: icons.chevronUp, activeClass: 'bg-rose-50 text-rose-700 border-rose-300 shadow-xs', inactiveClass: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100', iconColor: 'text-rose-600' },
    { id: 'medium', label: '보통', icon: icons.equal, activeClass: 'bg-amber-50 text-amber-800 border-amber-300 shadow-xs', inactiveClass: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100', iconColor: 'text-amber-600' },
    { id: 'low', label: '낮음', icon: icons.chevronDown, activeClass: 'bg-slate-200 text-slate-800 border-slate-300 shadow-xs', inactiveClass: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100', iconColor: 'text-slate-700' },
  ];

  elements.prioritySelector.innerHTML = priorities.map((p) => {
    const isSelected = state.selectedPriority === p.id;
    return `
      <button
        type="button"
        role="radio"
        aria-checked="${isSelected}"
        data-priority="${p.id}"
        class="priority-btn flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer border ${isSelected ? p.activeClass : p.inactiveClass + ' border-transparent'}"
      >
        <span class="${isSelected ? p.iconColor : 'text-slate-400'}">${p.icon}</span>
        <span>${p.label}</span>
      </button>
    `;
  }).join('');
}

function renderQuickDateButtons() {
  const todayStr = getLocalTodayString();
  const tomorrowStr = getRelativeDateString(1);
  const nextMondayStr = getNextMondayString();

  const chips = [
    { label: '마감일 없음', value: '' },
    { label: '오늘', value: todayStr },
    { label: '내일', value: tomorrowStr },
    { label: '다음주 월요일', value: nextMondayStr },
  ];

  elements.quickDateButtons.innerHTML = chips.map((c) => {
    const isSelected = state.selectedDueDate === c.value;
    return `
      <button
        type="button"
        data-date="${c.value}"
        class="quick-date-btn px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer shrink-0 ${
          isSelected
            ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
        }"
      >
        ${c.label}
      </button>
    `;
  }).join('');
}

function renderSummarySection() {
  const counts = getFilterCounts();
  const totalCount = counts.all;
  const completionPercentage = totalCount > 0 ? Math.round((counts.completed / totalCount) * 100) : 0;

  const card = (filterId, label, count, countColorClass, activeBorderClass, defaultBgClass) => {
    const isActive = state.activeFilter === filterId;
    return `
      <button
        type="button"
        data-summary-filter="${filterId}"
        class="summary-card-btn p-3 rounded-xl border text-left transition-all cursor-pointer ${
          isActive
            ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-100'
            : defaultBgClass
        }"
      >
        <span class="block text-xs font-semibold text-slate-500 mb-1">${label}</span>
        <div class="flex items-baseline gap-1">
          <span class="text-xl sm:text-2xl font-bold tabular-nums ${countColorClass}">${count}</span>
          <span class="text-xs ${countColorClass} font-medium">건</span>
        </div>
      </button>
    `;
  };

  elements.summarySection.innerHTML = `
    <div class="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-5">
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
        ${card('all', '전체 업무', counts.all, 'text-slate-900', 'border-blue-300', 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70')}
        ${card('pending', '진행 중', counts.pending, 'text-slate-800', 'border-blue-300', 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70')}
        ${card('dueToday', '오늘 마감', counts.dueToday, 'text-blue-800', 'border-blue-300', 'bg-blue-50/40 border-blue-100 hover:bg-blue-50/80')}
        ${card('overdue', '기한 지남', counts.overdue, counts.overdue > 0 ? 'text-rose-700' : 'text-slate-700', 'border-rose-300', counts.overdue > 0 ? 'bg-rose-50/40 border-rose-200 hover:bg-rose-50/80' : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70')}
        ${card('completed', '완료됨', counts.completed, 'text-emerald-800', 'border-emerald-300', 'col-span-2 sm:col-span-1 bg-emerald-50/30 border-emerald-100 hover:bg-emerald-50/70')}
      </div>

      ${totalCount > 0 ? `
        <div class="mt-4 pt-3.5 border-t border-slate-100">
          <div class="flex items-center justify-between text-xs mb-1.5">
            <span class="text-slate-500 font-semibold">전체 업무 달성률</span>
            <span class="font-bold text-blue-700 tabular-nums">${completionPercentage}% 완료</span>
          </div>
          <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
              style="width: ${completionPercentage}%"
              role="progressbar"
              aria-valuenow="${completionPercentage}"
              aria-valuemin="0"
              aria-valuemax="100"
            ></div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderFilterBar() {
  const counts = getFilterCounts();
  const filterTabs = [
    { id: 'all', label: '전체', count: counts.all },
    { id: 'pending', label: '진행 중', count: counts.pending },
    { id: 'dueToday', label: '오늘 마감', count: counts.dueToday },
    { id: 'overdue', label: '기한 지남', count: counts.overdue },
    { id: 'completed', label: '완료됨', count: counts.completed },
  ];

  elements.filterBarContainer.innerHTML = `
    <div class="space-y-3.5">
      <!-- Tabs -->
      <div class="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none" role="tablist">
        ${filterTabs.map((tab) => {
          const isActive = state.activeFilter === tab.id;
          const isOverdueTab = tab.id === 'overdue' && tab.count > 0;
          const isDueTodayTab = tab.id === 'dueToday' && tab.count > 0;

          return `
            <button
              type="button"
              role="tab"
              data-filter-tab="${tab.id}"
              aria-selected="${isActive}"
              class="filter-tab-btn inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : isOverdueTab
                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  : isDueTodayTab
                  ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }"
            >
              <span>${tab.label}</span>
              <span class="text-[11px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                isActive
                  ? 'bg-blue-700 text-white'
                  : isOverdueTab
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-100 text-slate-600'
              }">${tab.count}</span>
            </button>
          `;
        }).join('')}
      </div>

      <!-- Search & Sort Row -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div class="relative flex-1">
          <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">${icons.search}</span>
          <input
            id="task-search-input"
            type="text"
            value="${state.searchQuery}"
            placeholder="업무명으로 검색..."
            class="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
          />
          ${state.searchQuery ? `
            <button
              type="button"
              id="btn-clear-search"
              aria-label="검색어 지우기"
              class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
            >
              ${icons.x}
            </button>
          ` : ''}
        </div>

        <div class="flex items-center justify-between sm:justify-start gap-2 shrink-0 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
          <span class="text-xs text-slate-500 font-medium flex items-center gap-1.5 shrink-0">
            <span class="text-slate-400">${icons.arrowUpDown}</span>
            <span>정렬:</span>
          </span>
          <select
            id="task-sort-select"
            class="text-xs sm:text-sm text-slate-800 bg-transparent font-medium focus:outline-none cursor-pointer py-1 pr-1"
          >
            <option value="dueDate_asc" ${state.sortBy === 'dueDate_asc' ? 'selected' : ''}>마감일 빠른순</option>
            <option value="createdAt_desc" ${state.sortBy === 'createdAt_desc' ? 'selected' : ''}>등록 최신순</option>
            <option value="priority_desc" ${state.sortBy === 'priority_desc' ? 'selected' : ''}>우선순위 높은순</option>
            <option value="title_asc" ${state.sortBy === 'title_asc' ? 'selected' : ''}>가나다순</option>
          </select>
        </div>
      </div>
    </div>
  `;

  // Attach search listeners
  const searchInput = document.getElementById('task-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderTaskList();
      renderFilterBar();
    });
  }

  const btnClearSearch = document.getElementById('btn-clear-search');
  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      state.searchQuery = '';
      renderTaskList();
      renderFilterBar();
    });
  }

  // Attach sort listener
  const sortSelect = document.getElementById('task-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderTaskList();
    });
  }
}

function renderTaskList() {
  const filteredTasks = getFilteredAndSortedTasks();
  elements.taskCountBadge.textContent = `${filteredTasks.length}건`;

  if (filteredTasks.length === 0) {
    const isFiltered = state.activeFilter !== 'all' || state.searchQuery.trim().length > 0;
    if (isFiltered) {
      const filterLabels = {
        all: '전체',
        pending: '진행 중인',
        dueToday: '오늘 마감인',
        overdue: '기한이 지난',
        completed: '완료된',
      };

      elements.taskListContainer.innerHTML = `
        <div class="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            ${icons.filter}
          </div>
          <h3 class="text-sm sm:text-base font-semibold text-slate-800 mb-1">
            조건에 일치하는 업무가 없습니다
          </h3>
          <p class="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto mb-4">
            ${state.searchQuery
              ? `"${state.searchQuery}" 검색어와 일치하는 업무를 찾지 못했습니다.`
              : `${filterLabels[state.activeFilter]} 업무가 현재 없습니다.`}
          </p>
          <button
            type="button"
            id="btn-reset-filter"
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
          >
            필터 초기화
          </button>
        </div>
      `;
      const btnReset = document.getElementById('btn-reset-filter');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          state.activeFilter = 'all';
          state.searchQuery = '';
          render();
        });
      }
      return;
    }

    // Pure Empty State
    elements.taskListContainer.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 sm:p-10 text-center">
        <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
          ${icons.checkSquare}
        </div>
        <h3 class="text-base sm:text-lg font-bold text-slate-900 mb-2">
          등록된 업무가 없습니다
        </h3>
        <p class="text-xs sm:text-sm text-slate-600 max-w-md mx-auto mb-6 leading-relaxed">
          상단 입력창에서 오늘 처리해야 할 업무를 등록하고 계획을 시작해보세요.
          중요도에 따라 우선순위를 설정하고 마감일을 지정할 수 있습니다.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto text-left mb-6">
          <div class="p-3 bg-slate-50/70 rounded-lg border border-slate-100">
            <span class="text-xs font-bold text-slate-800 block mb-1">1. 업무 등록</span>
            <span class="text-xs text-slate-500 leading-normal block">해야 할 일의 제목을 작성하고 Enter를 누르세요.</span>
          </div>
          <div class="p-3 bg-slate-50/70 rounded-lg border border-slate-100">
            <span class="text-xs font-bold text-slate-800 block mb-1">2. 우선순위 & 마감일</span>
            <span class="text-xs text-slate-500 leading-normal block">높음/보통/낮음 선택 및 날짜를 지정해 체계적으로 관리하세요.</span>
          </div>
          <div class="p-3 bg-slate-50/70 rounded-lg border border-slate-100">
            <span class="text-xs font-bold text-slate-800 block mb-1">3. 상태 관리</span>
            <span class="text-xs text-slate-500 leading-normal block">완료 시 체크하여 달성률을 높이고 기한 지남 여부를 확인하세요.</span>
          </div>
        </div>
        <button
          type="button"
          id="btn-empty-goto-input"
          class="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <span class="text-white">${icons.plus}</span>
          <span>첫 업무 등록하러 가기</span>
        </button>
      </div>
    `;

    const btnGoInput = document.getElementById('btn-empty-goto-input');
    if (btnGoInput) {
      btnGoInput.addEventListener('click', () => {
        elements.taskTitleInput.focus();
        elements.taskTitleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    return;
  }

  // Render list of task cards
  const priorityConfig = {
    high: { label: '높음', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: icons.chevronUp, iconColor: 'text-rose-600' },
    medium: { label: '보통', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: icons.equal, iconColor: 'text-amber-600' },
    low: { label: '낮음', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', icon: icons.chevronDown, iconColor: 'text-slate-500' },
  };

  elements.taskListContainer.innerHTML = `
    <ul class="space-y-3" role="list">
      ${filteredTasks.map((task) => {
        const dateStatus = getTaskDateStatus(task);
        const pStyle = priorityConfig[task.priority] || priorityConfig.medium;

        const cardBorderClass = task.completed
          ? 'bg-slate-50/80 border-slate-200/80 opacity-85'
          : dateStatus.isOverdue
          ? 'bg-white border-rose-300/80 shadow-xs hover:border-rose-400'
          : dateStatus.isDueToday
          ? 'bg-white border-blue-300/80 shadow-xs hover:border-blue-400'
          : 'bg-white border-slate-200 shadow-xs hover:border-slate-300';

        const statusIcon = dateStatus.type === 'overdue' ? icons.alertTriangle
          : dateStatus.type === 'due_today' ? icons.clock
          : dateStatus.type === 'completed' ? icons.check
          : icons.calendar;

        return `
          <li
            data-task-id="${task.id}"
            class="group relative p-4 sm:p-5 rounded-2xl border transition-all ${cardBorderClass}"
          >
            <div class="flex flex-col gap-3">
              <!-- Top Row: Checkbox + Title + Action buttons -->
              <div class="flex items-start justify-between gap-3 min-w-0">
                <div class="flex items-start gap-3 min-w-0 flex-1">
                  <!-- Checkbox -->
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked="${task.completed}"
                    data-action="toggle-complete"
                    data-task-id="${task.id}"
                    aria-label="${task.completed ? '미완료로 변경' : '완료로 표시'}"
                    class="mt-0.5 w-6 h-6 shrink-0 rounded-md border flex items-center justify-center transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      task.completed
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-300 hover:border-blue-500 text-transparent'
                    }"
                  >
                    <span class="${task.completed ? 'opacity-100' : 'opacity-0'}">${icons.check}</span>
                  </button>

                  <!-- Task Title -->
                  <div class="flex-1 min-w-0 pt-0.5">
                    <p class="text-base sm:text-[17px] font-semibold break-words leading-relaxed transition-colors ${
                      task.completed
                        ? 'line-through decoration-slate-400 decoration-2 text-slate-400 font-normal'
                        : 'text-slate-900'
                    }">
                      ${escapeHtml(task.title)}
                    </p>
                  </div>
                </div>

                <!-- Action buttons -->
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    data-action="edit-task"
                    data-task-id="${task.id}"
                    aria-label="업무 수정"
                    title="업무 수정"
                    class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                  >
                    ${icons.edit3}
                  </button>
                  <button
                    type="button"
                    data-action="delete-task"
                    data-task-id="${task.id}"
                    aria-label="업무 삭제"
                    title="업무 삭제"
                    class="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    ${icons.trash2}
                  </button>
                </div>
              </div>

              <!-- Bottom Row: Metadata Badges (No clipping on mobile) -->
              <div class="flex flex-wrap items-center gap-2 pl-9 text-xs">
                <!-- Priority Badge with explicit text -->
                <span
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${pStyle.bg} ${pStyle.text} ${pStyle.border} shrink-0"
                  title="우선순위: ${pStyle.label}"
                >
                  <span class="${pStyle.iconColor}">${pStyle.icon}</span>
                  <span>우선순위: ${pStyle.label}</span>
                </span>

                <!-- Date Status Badge -->
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${dateStatus.badgeClass} shrink-0">
                  <span>${statusIcon}</span>
                  <span>${dateStatus.badgeText}</span>
                </span>

                <!-- Date Detail Text -->
                ${task.dueDate ? `
                  <span class="text-slate-500 text-xs flex items-center gap-1 font-medium shrink-0">
                    <span class="text-slate-400">${icons.calendar}</span>
                    <span>${dateStatus.detailsText}</span>
                  </span>
                ` : `
                  <span class="text-slate-400 text-xs shrink-0">마감일 없음</span>
                `}
              </div>
            </div>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function renderUndoToast() {
  if (!state.lastDeletedTask) {
    elements.undoToastContainer.innerHTML = '';
    return;
  }

  elements.undoToastContainer.innerHTML = `
    <div
      role="status"
      aria-live="polite"
      class="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3.5 text-xs sm:text-sm animate-fadeIn max-w-[92vw] border border-slate-700"
    >
      <span class="truncate max-w-[180px] sm:max-w-[280px] font-medium">
        '${escapeHtml(state.lastDeletedTask.task.title)}' 업무가 삭제되었습니다.
      </span>
      <button
        type="button"
        id="btn-undo-delete"
        class="flex items-center gap-1 font-bold text-blue-300 hover:text-white underline cursor-pointer shrink-0"
      >
        <span>${icons.rotateCcw}</span>
        <span>실행 취소</span>
      </button>
    </div>
  `;

  const btnUndo = document.getElementById('btn-undo-delete');
  if (btnUndo) {
    btnUndo.addEventListener('click', handleUndoDelete);
  }
}

function renderEditModal() {
  if (!state.editingTask) {
    elements.editModalContainer.innerHTML = '';
    return;
  }

  const task = state.editingTask;
  const todayStr = getLocalTodayString();
  const tomorrowStr = getRelativeDateString(1);

  elements.editModalContainer.innerHTML = `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <div class="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-scaleIn">
        <div class="flex items-center justify-between px-6 py-4.5 border-b border-slate-100">
          <div>
            <h3 id="edit-modal-title" class="text-base sm:text-lg font-bold text-slate-900">
              업무 내용 수정
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">
              제목, 우선순위, 마감일을 변경할 수 있습니다
            </p>
          </div>
          <button
            type="button"
            id="btn-close-edit-modal"
            aria-label="닫기"
            class="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ${icons.x}
          </button>
        </div>

        <form id="edit-task-form" class="p-6 space-y-5">
          <!-- Title -->
          <div>
            <label for="modal-edit-title" class="block text-xs font-bold text-slate-700 mb-1.5">
              업무명 <span class="text-rose-500">*</span>
            </label>
            <input
              id="modal-edit-title"
              type="text"
              value="${escapeHtml(task.title)}"
              class="w-full px-4 py-2.5 text-sm sm:text-base text-slate-900 bg-white border border-slate-300 rounded-xl transition-colors outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            <div id="modal-edit-error" class="hidden flex items-center gap-1.5 mt-2 text-xs font-semibold text-rose-600">
              <span>${icons.alertCircle}</span>
              <span id="modal-edit-error-text"></span>
            </div>
          </div>

          <!-- Priority -->
          <div>
            <span class="block text-xs font-bold text-slate-700 mb-1.5">
              우선순위 (높음 / 보통 / 낮음)
            </span>
            <div class="grid grid-cols-3 gap-2 p-1 bg-slate-50 rounded-xl border border-slate-200" id="modal-priority-selector">
              <button
                type="button"
                data-priority="high"
                class="modal-p-btn flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer border ${task.priority === 'high' ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-xs' : 'text-slate-600 hover:text-slate-900 border-transparent'}"
              >
                <span class="${task.priority === 'high' ? 'text-rose-600' : 'text-slate-400'}">${icons.chevronUp}</span>
                <span>높음</span>
              </button>
              <button
                type="button"
                data-priority="medium"
                class="modal-p-btn flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer border ${task.priority === 'medium' ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-xs' : 'text-slate-600 hover:text-slate-900 border-transparent'}"
              >
                <span class="${task.priority === 'medium' ? 'text-amber-600' : 'text-slate-400'}">${icons.equal}</span>
                <span>보통</span>
              </button>
              <button
                type="button"
                data-priority="low"
                class="modal-p-btn flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer border ${task.priority === 'low' ? 'bg-slate-200 text-slate-800 border-slate-300 shadow-xs' : 'text-slate-600 hover:text-slate-900 border-transparent'}"
              >
                <span class="${task.priority === 'low' ? 'text-slate-700' : 'text-slate-400'}">${icons.chevronDown}</span>
                <span>낮음</span>
              </button>
            </div>
          </div>

          <!-- Due Date -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label for="modal-edit-date" class="text-xs font-bold text-slate-700">마감일 (선택사항)</label>
              <button
                type="button"
                id="modal-btn-clear-date"
                class="text-xs text-rose-600 hover:underline font-medium cursor-pointer"
              >
                마감일 없음으로 변경
              </button>
            </div>
            <input
              id="modal-edit-date"
              type="date"
              value="${task.dueDate || ''}"
              class="w-full px-3.5 py-2 text-xs sm:text-sm text-slate-900 bg-white border border-slate-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
            />
            <div class="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
              <button type="button" data-modal-date="" class="modal-date-chip px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 cursor-pointer">마감일 없음</button>
              <button type="button" data-modal-date="${todayStr}" class="modal-date-chip px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 cursor-pointer">오늘</button>
              <button type="button" data-modal-date="${tomorrowStr}" class="modal-date-chip px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 cursor-pointer">내일</button>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              id="btn-cancel-edit-modal"
              class="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              class="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
            >
              변경사항 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Attach modal event listeners
  let modalPriority = task.priority;
  const modalDateInput = document.getElementById('modal-edit-date');

  document.getElementById('btn-close-edit-modal')?.addEventListener('click', () => {
    state.editingTask = null;
    renderEditModal();
  });

  document.getElementById('btn-cancel-edit-modal')?.addEventListener('click', () => {
    state.editingTask = null;
    renderEditModal();
  });

  document.getElementById('modal-btn-clear-date')?.addEventListener('click', () => {
    if (modalDateInput) modalDateInput.value = '';
  });

  document.querySelectorAll('.modal-date-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (modalDateInput) modalDateInput.value = chip.getAttribute('data-modal-date') || '';
    });
  });

  document.querySelectorAll('.modal-p-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      modalPriority = btn.getAttribute('data-priority');
      document.querySelectorAll('.modal-p-btn').forEach((b) => {
        const bp = b.getAttribute('data-priority');
        const isSel = bp === modalPriority;
        b.className = `modal-p-btn flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer border ${
          isSel
            ? bp === 'high' ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-xs'
            : bp === 'medium' ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-xs'
            : 'bg-slate-200 text-slate-800 border-slate-300 shadow-xs'
            : 'text-slate-600 hover:text-slate-900 border-transparent'
        }`;
      });
    });
  });

  const editForm = document.getElementById('edit-task-form');
  const modalTitleInput = document.getElementById('modal-edit-title');
  const modalError = document.getElementById('modal-edit-error');
  const modalErrorText = document.getElementById('modal-edit-error-text');

  editForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const trimmed = modalTitleInput.value.trim();
    if (!trimmed) {
      if (modalError && modalErrorText) {
        modalError.classList.remove('hidden');
        modalErrorText.textContent = '공백만으로는 업무를 수정할 수 없습니다. 제목을 입력해주세요.';
      }
      return;
    }
    handleSaveEdit(task.id, trimmed, modalPriority, modalDateInput.value);
    renderEditModal();
  });
}

function render() {
  renderNoticeBanner();
  renderSummarySection();
  renderFilterBar();
  renderTaskList();
  renderUndoToast();
  renderEditModal();
}

/**
 * Escapes HTML characters for security.
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// EVENT LISTENERS INITIALIZATION
// ==========================================

function initEventListeners() {
  // Static Icons & Dates
  elements.headerLogoIcon.innerHTML = icons.checkSquare;
  elements.headerCalIcon.innerHTML = icons.calendar;
  elements.todayDateText.textContent = formatTodayKorean();
  elements.footerDateText.textContent = `기준 날짜: ${formatTodayKorean()}`;
  elements.inputSectionIcon.innerHTML = icons.plusCircle;
  elements.btnSubmitIcon.innerHTML = icons.plus;
  elements.listSectionIcon.innerHTML = icons.listTodo;
  elements.taskTitleErrorIcon.innerHTML = icons.alertCircle;

  // Render initial Priority buttons & Quick date chips
  renderPrioritySelector();
  renderQuickDateButtons();

  // Priority selection click
  elements.prioritySelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.priority-btn');
    if (!btn) return;
    state.selectedPriority = btn.getAttribute('data-priority');
    renderPrioritySelector();
  });

  // Quick date chips click
  elements.quickDateButtons.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-date-btn');
    if (!btn) return;
    const dateVal = btn.getAttribute('data-date') || '';
    state.selectedDueDate = dateVal;
    elements.taskDuedateInput.value = dateVal;
    renderQuickDateButtons();
  });

  // Date input change
  elements.taskDuedateInput.addEventListener('change', (e) => {
    state.selectedDueDate = e.target.value;
    renderQuickDateButtons();
  });

  // Clear date button
  elements.btnClearDate.addEventListener('click', () => {
    state.selectedDueDate = '';
    elements.taskDuedateInput.value = '';
    renderQuickDateButtons();
  });

  // Task title input change - clear error
  elements.taskTitleInput.addEventListener('input', () => {
    elements.taskTitleError.classList.add('hidden');
    elements.taskTitleInput.classList.remove('border-rose-400', 'ring-2', 'ring-rose-100');
  });

  // Form Submit
  elements.newTaskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const rawTitle = elements.taskTitleInput.value;
    const trimmed = rawTitle.trim();

    // Validation: prevent empty or whitespace only with explanation
    if (!trimmed) {
      elements.taskTitleError.classList.remove('hidden');
      elements.taskTitleInput.classList.add('border-rose-400', 'ring-2', 'ring-rose-100');
      if (rawTitle.length > 0) {
        elements.taskTitleErrorText.textContent = '공백만으로는 업무를 등록할 수 없습니다. 구체적인 업무명을 입력해주세요.';
      } else {
        elements.taskTitleErrorText.textContent = '업무명을 입력해주세요.';
      }
      elements.taskTitleInput.focus();
      return;
    }

    elements.taskTitleError.classList.add('hidden');
    elements.taskTitleInput.classList.remove('border-rose-400', 'ring-2', 'ring-rose-100');

    const added = handleAddTask(trimmed, state.selectedPriority, state.selectedDueDate);
    if (added) {
      elements.taskTitleInput.value = '';
      state.selectedPriority = 'medium';
      state.selectedDueDate = '';
      elements.taskDuedateInput.value = '';
      renderPrioritySelector();
      renderQuickDateButtons();
    }
  });

  // Filter Bar Tabs delegation
  elements.filterBarContainer.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.filter-tab-btn');
    if (tabBtn) {
      state.activeFilter = tabBtn.getAttribute('data-filter-tab');
      render();
    }
  });

  // Summary Card delegation
  elements.summarySection.addEventListener('click', (e) => {
    const cardBtn = e.target.closest('.summary-card-btn');
    if (cardBtn) {
      state.activeFilter = cardBtn.getAttribute('data-summary-filter');
      render();
    }
  });

  // Task List Event Delegation (Toggle complete, Edit, Delete)
  elements.taskListContainer.addEventListener('click', (e) => {
    // 1. Toggle Complete
    const toggleBtn = e.target.closest('[data-action="toggle-complete"]');
    if (toggleBtn) {
      const id = toggleBtn.getAttribute('data-task-id');
      handleToggleComplete(id);
      return;
    }

    // 2. Edit Task
    const editBtn = e.target.closest('[data-action="edit-task"]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-task-id');
      const task = state.tasks.find((t) => t.id === id);
      if (task) {
        state.editingTask = task;
        renderEditModal();
      }
      return;
    }

    // 3. Delete Task
    const deleteBtn = e.target.closest('[data-action="delete-task"]');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-task-id');
      handleDeleteTask(id);
      return;
    }
  });
}

// Initialize Application
initEventListeners();
render();
