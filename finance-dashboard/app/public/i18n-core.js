// Lightweight i18n core with dynamic language loading
(function(){
  const translations = {};
  const languageLoaders = {};
  let currentLanguage = 'en';

  function loadTranslations(lang, dict){
    translations[lang] = dict || {};
  }

  function ensureLanguageLoaded(lang){
    if (translations[lang]) return Promise.resolve();
    if (languageLoaders[lang]) return languageLoaders[lang];
    languageLoaders[lang] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `i18n.${lang}.js`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load language: ${lang}`));
      document.head.appendChild(script);
    });
    return languageLoaders[lang];
  }

  function t(key){
    return (translations[currentLanguage] && translations[currentLanguage][key])
      || (translations['en'] && translations['en'][key])
      || key;
  }

  function setLanguage(lang){
    const target = lang || 'en';
    const task = (async () => {
      try {
        await ensureLanguageLoaded(target);
      } catch (e) {
        if (target !== 'en') {
          try { await ensureLanguageLoaded('en'); } catch {}
        }
      }
      currentLanguage = translations[target] ? target : (translations['en'] ? 'en' : target);
      if (typeof updatePageTexts === 'function') updatePageTexts();
      try {
        const evt = new CustomEvent('i18n:languageChanged', { detail: { language: currentLanguage } });
        document.dispatchEvent(evt);
      } catch {}
      return currentLanguage;
    })();
    return task;
  }

  function getCurrentLanguage(){
    return currentLanguage;
  }

  // === DOM update helpers (copied from previous i18n.js) ===
  function updatePageTexts() {
    document.documentElement.lang = currentLanguage;
    document.title = t('app.title');
    const header = document.querySelector('header h1');
    if (header) header.textContent = t('app.title');
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) settingsBtn.setAttribute('aria-label', t('app.settings'));
    updateNavTabs();
    updateTransactionsSection();
    updateStatsSection();
    updateSummarySection();
    updateModals();
    updateSettingsModal();
    const fabAdd = document.getElementById('fab-add');
    if (fabAdd) {
      const isIncome = (typeof current !== 'undefined' && current === 'income');
      fabAdd.setAttribute('aria-label', t(isIncome ? 'transactions.addIncome' : 'transactions.addExpense'));
    }
    // Re-render dynamic tables/cards so headers and action buttons get new language.
    if (typeof renderTable === 'function') renderTable();
    if (typeof renderCards === 'function') renderCards();
    // Mark page as ready to show (avoid FOUC until language applied)
    try { document.documentElement.setAttribute('data-ready', '1'); } catch {}
  }

  function updateNavTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      const view = tab.getAttribute('data-view');
      if (view === 'transactions') tab.textContent = t('nav.transactions');
      if (view === 'stats') tab.textContent = t('nav.stats');
      if (view === 'summary') tab.textContent = t('nav.summary');
    });
  }

  function updateTransactionsSection() {
    const expBtn = document.getElementById('exp');
    const incBtn = document.getElementById('inc');
    if (expBtn) expBtn.textContent = t('transactions.expenses');
    if (incBtn) incBtn.textContent = t('transactions.income');
    const viewLabel = document.querySelector('.view-toggle .muted');
    if (viewLabel) viewLabel.textContent = t('transactions.view');
    const viewList = document.getElementById('view-list');
    const viewCards = document.getElementById('view-cards');
    if (viewList) viewList.textContent = t('transactions.viewTable');
    if (viewCards) viewCards.textContent = t('transactions.viewCards');
    const addBtn = document.getElementById('add-btn');
    if (addBtn) {
      const isIncome = (typeof current !== 'undefined' && current === 'income');
      addBtn.textContent = t(isIncome ? 'transactions.addIncome' : 'transactions.addExpense');
    }
    const filtersSummary = document.querySelector('details summary');
    if (filtersSummary) filtersSummary.textContent = t('filters.title');
    const filterLabels = document.querySelectorAll('.filters label');
    if (filterLabels[0]) {
      const text = filterLabels[0].childNodes[0];
      if (text && text.nodeType === Node.TEXT_NODE) text.textContent = t('filters.category');
    }
    if (filterLabels[1]) {
      const text = filterLabels[1].childNodes[0];
      if (text && text.nodeType === Node.TEXT_NODE) text.textContent = t('filters.currency');
    }
    if (filterLabels[2]) {
      const text = filterLabels[2].childNodes[0];
      if (text && text.nodeType === Node.TEXT_NODE) text.textContent = t('filters.who');
    }
    if (filterLabels[3]) {
      const text = filterLabels[3].childNodes[0];
      if (text && text.nodeType === Node.TEXT_NODE) text.textContent = t('filters.dateFrom');
    }
    if (filterLabels[4]) {
      const text = filterLabels[4].childNodes[0];
      if (text && text.nodeType === Node.TEXT_NODE) text.textContent = t('filters.dateTo');
    }
    const fltApply = document.getElementById('flt-apply');
    const fltReset = document.getElementById('flt-reset');
    if (fltApply) fltApply.textContent = t('filters.apply');
    if (fltReset) fltReset.textContent = t('filters.reset');
    document.querySelectorAll('.filters select option[value=""]').forEach(opt => {
      opt.textContent = t('filters.all');
    });
    const periodToday = document.getElementById('period-today');
    const periodWeek = document.getElementById('period-week');
    const periodMonth = document.getElementById('period-month');
    if (periodToday) periodToday.textContent = t('period.today');
    if (periodWeek) periodWeek.textContent = t('period.week');
    if (periodMonth) periodMonth.textContent = t('period.month');
    const pagerLeft = document.querySelector('.pager-left');
    if (pagerLeft) {
      const textNode = pagerLeft.childNodes[0];
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = t('pager.showBy') + ' ';
      }
      const allOption = pagerLeft.querySelector('option[value="all"]');
      if (allOption) allOption.textContent = t('pager.all');
    }
    const prevPage = document.getElementById('prev-page');
    const nextPage = document.getElementById('next-page');
    if (prevPage) prevPage.textContent = t('pager.prev');
    if (nextPage) nextPage.textContent = t('pager.next');
    document.querySelectorAll('.row-actions .btn:not(.danger)').forEach(btn => {
      btn.textContent = t('action.edit');
    });
    document.querySelectorAll('.row-actions .btn.danger').forEach(btn => {
      btn.textContent = t('action.delete');
    });
    document.querySelectorAll('.card-actions .btn').forEach((btn, index) => {
      if (index % 2 === 0) {
        btn.textContent = t('action.details');
      } else {
        btn.textContent = t('action.edit');
      }
    });
  }

  function updateStatsSection() {
    const statsTitle = document.getElementById('stats-title');
    if (statsTitle) statsTitle.textContent = t('stats.title');
    const statsDesc = document.querySelector('#stats-view .muted');
    if (statsDesc) statsDesc.textContent = t('stats.description');
    document.querySelectorAll('[data-stats-period]').forEach(btn => {
      const period = btn.getAttribute('data-stats-period');
      if (period === 'this_month') btn.textContent = t('period.thisMonth');
      if (period === 'last_month') btn.textContent = t('period.lastMonth');
      if (period === 'custom') btn.textContent = t('period.custom');
    });
    const statsRange = document.getElementById('stats-range');
    if (statsRange) {
      const labels = statsRange.querySelectorAll('label');
      if (labels[0]) labels[0].childNodes[0].textContent = t('stats.from');
      if (labels[1]) labels[1].childNodes[0].textContent = t('stats.to');
    }
    const statsApply = document.getElementById('stats-apply');
    if (statsApply) statsApply.textContent = t('stats.show');
    const statsLoading = document.getElementById('stats-loading');
    const statsEmpty = document.getElementById('categories-empty');
    if (statsLoading) statsLoading.textContent = t('stats.loading');
    if (statsEmpty) statsEmpty.textContent = t('stats.empty');
  }

  function updateSummarySection() {
    const summaryTitle = document.getElementById('summary-title');
    if (summaryTitle) summaryTitle.textContent = t('summary.title');
    document.querySelectorAll('[data-summary-period]').forEach(btn => {
      const period = btn.getAttribute('data-summary-period');
      if (period === 'this_month') btn.textContent = t('period.thisMonth');
      if (period === 'last_month') btn.textContent = t('period.lastMonth');
      if (period === 'all') btn.textContent = t('period.allTime');
      if (period === 'custom') btn.textContent = t('period.custom');
    });
    const summaryRange = document.getElementById('summary-range');
    if (summaryRange) {
      const labels = summaryRange.querySelectorAll('label');
      if (labels[0]) labels[0].childNodes[0].textContent = t('stats.from');
      if (labels[1]) labels[1].childNodes[0].textContent = t('stats.to');
    }
    const summaryApply = document.getElementById('summary-apply');
    if (summaryApply) summaryApply.textContent = t('stats.show');
    const summaryLoading = document.getElementById('summary-loading');
    const summaryEmpty = document.getElementById('summary-empty');
    if (summaryLoading) summaryLoading.textContent = t('summary.loading');
    if (summaryEmpty) summaryEmpty.textContent = t('summary.empty');
    const summaryCards = document.querySelectorAll('.summary-card');
    if (summaryCards[0]) summaryCards[0].querySelector('h3').textContent = t('summary.spent');
    if (summaryCards[1]) summaryCards[1].querySelector('h3').textContent = t('summary.earned');
    if (summaryCards[2]) summaryCards[2].querySelector('h3').textContent = t('summary.balance');
  }

  function updateModals() {
    if (typeof updateFormMode === 'function') updateFormMode();
    const formLabels = document.querySelectorAll('#edit-form label');
    if (formLabels[0]) formLabels[0].childNodes[0].textContent = t('form.description');
    if (formLabels[1]) formLabels[1].childNodes[0].textContent = t('form.category');
    if (formLabels[2]) formLabels[2].childNodes[0].textContent = t('form.amount');
    if (formLabels[3]) formLabels[3].childNodes[0].textContent = t('form.currency');
    if (formLabels[4]) formLabels[4].childNodes[0].textContent = t('form.dateTime');
    if (formLabels[5]) formLabels[5].childNodes[0].textContent = t('form.who');
    if (formLabels[6]) formLabels[6].childNodes[0].textContent = t('form.note');
    const descInput = document.getElementById('f-description');
    const whoInput = document.getElementById('f-who');
    const noteInput = document.getElementById('f-note');
    if (descInput) descInput.placeholder = t('form.descriptionPlaceholder');
    if (whoInput) whoInput.placeholder = t('form.whoPlaceholder');
    if (noteInput) noteInput.placeholder = t('form.notePlaceholder');
    const saveBtn = document.getElementById('save-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    if (saveBtn) saveBtn.textContent = t('form.save');
    if (deleteBtn) deleteBtn.textContent = t('action.delete');
    if (cancelBtn) cancelBtn.textContent = t('form.cancel');
    const detailsTitle = document.querySelector('#details-modal h3');
    if (detailsTitle) detailsTitle.textContent = t('details.title');
    const detailsEdit = document.getElementById('details-edit');
    const detailsClose = document.getElementById('details-close');
    if (detailsEdit) detailsEdit.textContent = t('details.edit');
    if (detailsClose) detailsClose.textContent = t('details.close');
  }

  function updateSettingsModal() {
    const settingsTitle = document.querySelector('#settings-modal h3');
    if (settingsTitle) settingsTitle.textContent = t('settings.title');
    const tabs = document.querySelectorAll('.settings-tab');
    tabs.forEach(tab => {
      const tabName = tab.getAttribute('data-tab');
      const label = tab.querySelector('.tab-label');
      if (label) {
        if (tabName === 'profile') label.textContent = t('settings.tab.profile');
        if (tabName === 'categories') label.textContent = t('settings.tab.categories');
        if (tabName === 'currencies') label.textContent = t('settings.tab.currencies');
        if (tabName === 'backups') label.textContent = t('settings.tab.backups');
      }
    });
    const profileTitle = document.querySelector('[data-tab="profile"] h4');
    if (profileTitle) profileTitle.textContent = t('settings.profile.title');
    const profileLabels = document.querySelectorAll('[data-tab="profile"] label');
    if (profileLabels[0]) {
      const text = profileLabels[0].childNodes[0];
      if (text && text.nodeType === Node.TEXT_NODE) text.textContent = t('settings.profile.defaultName');
    }
    if (profileLabels[1]) {
      const text = profileLabels[1].childNodes[0];
      if (text && text.nodeType === Node.TEXT_NODE) text.textContent = t('settings.profile.language');
    }
    if (profileLabels[2]) {
      const text = profileLabels[2].childNodes[0];
      if (text && text.nodeType === Node.TEXT_NODE) text.textContent = t('settings.profile.chartType');
    }
    const defaultWhoInput = document.getElementById('default-who-input');
    if (defaultWhoInput) defaultWhoInput.placeholder = t('settings.profile.defaultNamePlaceholder');
    const chartOptions = document.querySelectorAll('#settings-chart-type option');
    if (chartOptions[0]) chartOptions[0].textContent = t('settings.profile.chartPie');
    if (chartOptions[1]) chartOptions[1].textContent = t('settings.profile.chartBar');
    const notifyLabel = document.getElementById('notify-label');
    if (notifyLabel) notifyLabel.textContent = t('settings.profile.notifications');
    const categoriesTitle = document.querySelector('[data-tab="categories"] h4');
    if (categoriesTitle) categoriesTitle.textContent = t('settings.categories.title');
    const newCategoryInput = document.getElementById('new-category-input');
    if (newCategoryInput) newCategoryInput.placeholder = t('settings.categories.new');
    const categoryAddBtn = document.querySelector('#category-form button');
    if (categoryAddBtn) categoryAddBtn.textContent = t('settings.categories.add');
    const currenciesTitle = document.querySelector('[data-tab="currencies"] h4');
    if (currenciesTitle) currenciesTitle.textContent = t('settings.currencies.title');
    const newCurrencyInput = document.getElementById('new-currency-input');
    const newCurrencyRateInput = document.getElementById('new-currency-rate-input');
    if (newCurrencyInput) newCurrencyInput.placeholder = t('settings.currencies.code');
    if (newCurrencyRateInput) newCurrencyRateInput.placeholder = t('settings.currencies.rate');
    const currencyAddBtn = document.querySelector('#currency-form button');
    if (currencyAddBtn) currencyAddBtn.textContent = t('settings.currencies.add');
    const backupsTitle = document.querySelector('[data-tab="backups"] h4');
    if (backupsTitle) backupsTitle.textContent = t('settings.backups.title');
    const backupHint = document.getElementById('backup-script-hint');
    if (backupHint) backupHint.textContent = t('settings.backups.hint');
    const backupTimeLabel = document.querySelector('label[for="backup-run-time"]');
    if (backupTimeLabel) backupTimeLabel.querySelector('span').textContent = t('settings.backups.runTime');
    const backupAutoLabel = document.getElementById('backup-auto-label');
    if (backupAutoLabel) backupAutoLabel.textContent = t('settings.backups.autoToggle');
    const backupRefresh = document.getElementById('backup-refresh');
    const backupRun = document.getElementById('backup-run');
    if (backupRefresh) backupRefresh.textContent = t('settings.backups.refresh');
    if (backupRun) backupRun.textContent = t('settings.backups.createNow');
    const settingsSave = document.getElementById('settings-save');
    const settingsCancel = document.getElementById('settings-cancel');
    const settingsLogout = document.getElementById('settings-logout');
    if (settingsSave) settingsSave.textContent = t('settings.save');
    if (settingsCancel) settingsCancel.textContent = t('settings.cancel');
    if (settingsLogout) settingsLogout.textContent = t('settings.logout');
  }

  // Export
  if (typeof window !== 'undefined') {
    window.i18n = {
      t,
      setLanguage,
      getCurrentLanguage,
      updatePageTexts,
      loadTranslations
    };
  }
})();
