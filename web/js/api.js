/* ============================================================
   window.pywebview.api の薄いラッパー

   Python 側は業務エラーを {"error": "..."} という戻り値で返す
   （例外の伝わり方が pywebview の版に依存するため）。
   ここで throw に変換し、呼び出し側は try/catch だけ書けばよくする。
   ============================================================ */

async function call(name, ...args) {
  if (!window.pywebview || !window.pywebview.api) {
    throw new Error('アプリの準備ができていません');
  }
  const r = await window.pywebview.api[name](...args);
  if (r && typeof r === 'object' && !Array.isArray(r) && r.error) {
    throw new Error(r.error);
  }
  return r;
}

const api = {
  // タスク
  listTasks:       params        => call('list_tasks', params),
  getTask:         id            => call('get_task', id),
  createTask:      body          => call('create_task', body),
  updateTask:      (id, body)    => call('update_task', id, body),
  deleteTask:      id            => call('delete_task', id),
  reorderTasks:    ids           => call('reorder_tasks', ids),
  bulkUpdateTasks: (ids, body)   => call('bulk_update_tasks', ids, body),
  deleteCompleted: before        => call('delete_completed', before || ''),
  calendarTasks:   params        => call('calendar_tasks', params),
  counts:          params        => call('counts', params),

  // ジャンル・カテゴリ
  listGenres:      withCats      => call('list_genres', !!withCats),
  createGenre:     (name, color) => call('create_genre', name, color || ''),
  updateGenre:     (id, body)    => call('update_genre', id, body),
  deleteGenre:     id            => call('delete_genre', id),
  reorderGenres:   ids           => call('reorder_genres', ids),
  listCategories:  genreId       => call('list_categories', genreId),
  reorderCategories: (gid, ids)  => call('reorder_categories', gid, ids),
  createCategory:  (gid, name)   => call('create_category', gid, name),
  updateCategory:  (id, name)    => call('update_category', id, name),
  countTasksOfCategory: id       => call('count_tasks_of_category', id),
  deleteCategory:  id            => call('delete_category', id),

  // ウィンドウ
  openCalendar:    ()            => call('open_calendar'),
  closeCalendar:   ()            => call('close_calendar'),
  focusTask:       id            => call('focus_task', id),
  dueTasks:        ()            => call('due_tasks'),
  closeNotify:     ()            => call('close_notify'),
  testNotification: ()           => call('test_notification'),

  // 設定
  getSettings:     ()            => call('get_settings'),
  saveSettings:    body          => call('save_settings', body),
  backupNow:       ()            => call('backup_now'),
  chooseFolder:    current       => call('choose_folder', current || ''),

  // インポート
  importCsv:       ()            => call('import_csv'),
};
