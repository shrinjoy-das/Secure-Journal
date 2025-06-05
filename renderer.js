const { ipcRenderer } = require('electron');

class SecureJournalApp {
  highlightText(text, search) {
    if (!search) return text;
    const re = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<mark>$1</mark>');
  }
  constructor() {
    this.currentDate = null;
    this.isUnsaved = false;
    this.entries = [];
    this.isAuthenticated = false;
    this.currentSettings = null;
    this.openTabs = [];
    this.calendarYear = (new Date()).getFullYear();
    this.calendarMonth = (new Date()).getMonth();
    this.hideCalendarHoverMessage = this.hideCalendarHoverMessage.bind(this);
    this.initializeElements();
    this.bindEvents();
    this.checkAuthState();
  }
  getMonthName(monthIdx) {
    return ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'][monthIdx];
  }

  initializeElements() {
    // Auth elements
    this.authContainer = document.getElementById('authContainer');
    this.setupScreen = document.getElementById('setupScreen');
    this.loginScreen = document.getElementById('loginScreen');
    this.setupForm = document.getElementById('setupForm');
    this.loginForm = document.getElementById('loginForm');
    this.setupPassword = document.getElementById('setupPassword');
    this.confirmPassword = document.getElementById('confirmPassword');
    this.loginPassword = document.getElementById('loginPassword');
    this.passwordStrength = document.getElementById('passwordStrength');
    this.strengthBar = document.getElementById('strengthBar');
    this.strengthText = document.getElementById('strengthText');
    this.confirmError = document.getElementById('confirmError');
    this.loginError = document.getElementById('loginError');
    
    // App elements
    this.appContainer = document.getElementById('appContainer');
    this.newEntryBtn = document.getElementById('newEntryBtn');
    this.entriesList = document.getElementById('entriesList');
    this.currentDateEl = document.getElementById('currentDate');
    this.journalEditor = document.getElementById('journalEditor');
    this.emptyState = document.getElementById('emptyState');
    this.statusMessage = document.getElementById('statusMessage');
    this.logoutBtn = document.getElementById('logoutBtn');
    this.settingsBtn = document.getElementById('settingsBtn');
    this.searchBar = document.getElementById('searchBar');
    // Editor tabs container
    this.editorTabs = document.getElementById('editorTabs');
    
    // Settings modal elements
    this.settingsModal = document.getElementById('settingsModal');
    this.changePasswordForm = document.getElementById('changePasswordForm');
    this.currentPassword = document.getElementById('currentPassword');
    this.newPassword = document.getElementById('newPassword');
    this.confirmNewPassword = document.getElementById('confirmNewPassword');
    this.newPasswordStrength = document.getElementById('newPasswordStrength');
    this.newStrengthBar = document.getElementById('newStrengthBar');
    this.newStrengthText = document.getElementById('newStrengthText');
    this.newConfirmError = document.getElementById('newConfirmError');
    this.cancelPasswordChange = document.getElementById('cancelPasswordChange');
    
    // Enhanced settings elements
    this.darkThemeBtn = document.getElementById('darkThemeBtn');
    this.lightThemeBtn = document.getElementById('lightThemeBtn');
    this.dateFormatSelect = document.getElementById('dateFormat');
    // Dynamically update date format options with current date
    const now = new Date();
    this.dateFormatSelect.innerHTML = `
      <option value="US">US (${now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })})</option>
      <option value="EU">EU (${now.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })})</option>
      <option value="ISO">ISO (${now.toISOString().slice(0, 10)})</option>
    `;
    // Set the dropdown to the user's last selected date format on app start
    ipcRenderer.invoke('get-settings').then((response) => {
      if (response && response.settings && response.settings.dateFormat) {
        this.dateFormatSelect.value = response.settings.dateFormat;
      }
    });
    this.currentDirectoryInput = document.getElementById('currentDirectory');
    this.selectDirectoryBtn = document.getElementById('selectDirectoryBtn');
    this.cancelSettings = document.getElementById('cancelSettings');
  }

  bindEvents() {
    // Auth events
    this.setupForm.addEventListener('submit', (e) => this.handleSetup(e));
    this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    this.setupPassword.addEventListener('input', () => this.checkPasswordStrength(this.setupPassword.value, this.passwordStrength, this.strengthBar, this.strengthText));
    this.confirmPassword.addEventListener('input', () => this.checkPasswordMatch());
    
    // App events
    this.newEntryBtn.addEventListener('click', () => this.createNewEntry());
    this.journalEditor.addEventListener('input', () => this.autoSaveEntry());
    this.logoutBtn.addEventListener('click', () => this.logout());
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    this.searchBar.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderEntriesList();
    });
    
    // Settings events
    this.changePasswordForm.addEventListener('submit', (e) => this.handlePasswordChange(e));
    this.cancelSettings.addEventListener('click', () => this.closeSettings());
    this.newPassword.addEventListener('input', () => this.checkPasswordStrength(this.newPassword.value, this.newPasswordStrength, this.newStrengthBar, this.newStrengthText));
    this.confirmNewPassword.addEventListener('input', () => this.checkNewPasswordMatch());
    
    // Enhanced settings events
    this.darkThemeBtn.addEventListener('click', () => this.setTheme('dark'));
    this.lightThemeBtn.addEventListener('click', () => this.setTheme('light'));
    this.dateFormatSelect.addEventListener('change', async (e) => {
      const newFormat = e.target.value;
      // Save the new setting
      let response = await ipcRenderer.invoke('get-settings');
      let settings = response && response.settings ? response.settings : {};
      settings.dateFormat = newFormat;
      await ipcRenderer.invoke('save-settings', settings);
      // Update UI everywhere
      this.refreshDates();
    });
    this.selectDirectoryBtn.addEventListener('click', async () => {
    const res = await ipcRenderer.invoke('select-directory');
    if (res && res.success && res.directory) {
      this.currentDirectoryInput.value = res.directory;
      // Persist this new directory in settings
      let response = await ipcRenderer.invoke('get-settings');
      let settings = response && response.settings ? response.settings : {};
      settings.dataDirectory = res.directory;
      await ipcRenderer.invoke('save-settings', settings);
      this.showStatus('Storage directory updated!', 'success');
    }
  });
    
    // Modal overlay click to close
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) {
        this.closeSettings();
      }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (this.isAuthenticated && (e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.saveCurrentEntry();
      }
      if (e.key === 'Escape') {
        this.closeSettings();
      }
    });
  }

  async checkAuthState() {
    try {
      const passwordExists = await ipcRenderer.invoke('check-password-exists');
      if (passwordExists) {
        this.showLoginScreen();
      } else {
        this.showSetupScreen();
      }
    } catch (error) {
      this.showStatus('Error checking authentication state', 'error');
    }
  }

  showSetupScreen() {
    this.authContainer.style.display = 'flex';
    this.setupScreen.style.display = 'block';
    this.loginScreen.style.display = 'none';
    this.appContainer.style.display = 'none';
    this.setupPassword.focus();
  }

  showLoginScreen() {
    this.authContainer.style.display = 'flex';
    this.setupScreen.style.display = 'none';
    this.loginScreen.style.display = 'block';
    this.appContainer.style.display = 'none';
    this.loginPassword.focus();
  }

  showApp() {
    this.authContainer.style.display = 'none';
    this.appContainer.style.display = 'block';
    this.isAuthenticated = true;
    this.loadEntries();
    // After loading entries, if there are no entries and no open tabs, render the default tab and show empty state
    if (!this.entries.length && !this.openTabs.length) {
      this.renderTabs();
      this.journalEditor.style.display = 'none';
      this.emptyState.style.display = 'flex';
    }
    // Show the storage directory in settings modal if it exists
    ipcRenderer.invoke('get-settings').then((response) => {
      if (response && response.settings && response.settings.dataDirectory) {
        this.currentDirectoryInput.value = response.settings.dataDirectory;
      }
    }).catch(() => {});
  }

  async handleSetup(e) {
    e.preventDefault();
    
    const password = this.setupPassword.value;
    const confirm = this.confirmPassword.value;
    
    if (password !== confirm) {
      this.confirmError.textContent = 'Passwords do not match';
      this.confirmError.style.display = 'block';
      return;
    }
    
    if (password.length < 8) {
      this.confirmError.textContent = 'Password must be at least 8 characters long';
      this.confirmError.style.display = 'block';
      return;
    }
    
    try {
      const result = await ipcRenderer.invoke('set-password', password);
      if (result.success) {
        this.showStatus('Secure journal created successfully!', 'success');
        this.showApp();
      } else {
        this.showStatus('Failed to create secure journal', 'error');
      }
    } catch (error) {
      this.showStatus('Error creating secure journal', 'error');
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    
    const password = this.loginPassword.value;
    
    try {
      const result = await ipcRenderer.invoke('verify-password', password);
      if (result.success) {
        this.showStatus('Journal unlocked!', 'success');
        this.showApp();
        this.loginPassword.value = '';
        this.loginError.style.display = 'none';
      } else {
        this.loginError.textContent = 'Invalid password';
        this.loginError.style.display = 'block';
        this.loginPassword.value = '';
        this.loginPassword.focus();
      }
    } catch (error) {
      this.showStatus('Error verifying password', 'error');
    }
  }

  async logout() {
    if (this.isUnsaved) {
      const save = confirm('You have unsaved changes. Save before logging out?');
      if (save) {
        await this.saveCurrentEntry();
      }
    }
    
    try {
      await ipcRenderer.invoke('logout');
      this.isAuthenticated = false;
      this.currentDate = null;
      this.isUnsaved = false;
      this.entries = [];
      this.checkAuthState();
    } catch (error) {
      this.showStatus('Error logging out', 'error');
    }
  }

  checkPasswordStrength(password, container, bar, text) {
    if (password.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    container.style.display = 'block';
    
    let strength = 0;
    let feedback = [];
    
    // Length check
    if (password.length >= 8) strength += 1;
    else feedback.push('at least 8 characters');
    
    // Uppercase check
    if (/[A-Z]/.test(password)) strength += 1;
    else feedback.push('uppercase letter');
    
    // Lowercase check
    if (/[a-z]/.test(password)) strength += 1;
    else feedback.push('lowercase letter');
    
    // Number check
    if (/\d/.test(password)) strength += 1;
    else feedback.push('number');
    
    // Special character check
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    else feedback.push('special character');
    
    // Update UI
    bar.className = 'strength-bar';
    if (strength <= 2) {
      bar.classList.add('strength-weak');
      text.textContent = `Weak password. Add: ${feedback.slice(0, 2).join(', ')}`;
    } else if (strength <= 4) {
      bar.classList.add('strength-medium');
      text.textContent = feedback.length > 0 ? `Medium strength. Consider adding: ${feedback[0]}` : 'Good password';
    } else {
      bar.classList.add('strength-strong');
      text.textContent = 'Strong password';
    }
  }

  checkPasswordMatch() {
    const password = this.setupPassword.value;
    const confirm = this.confirmPassword.value;
    
    if (confirm.length === 0) {
      this.confirmError.style.display = 'none';
      return;
    }
    
    if (password !== confirm) {
      this.confirmError.textContent = 'Passwords do not match';
      this.confirmError.style.display = 'block';
    } else {
      this.confirmError.style.display = 'none';
    }
  }

  checkNewPasswordMatch() {
    const password = this.newPassword.value;
    const confirm = this.confirmNewPassword.value;
    
    if (confirm.length === 0) {
      this.newConfirmError.style.display = 'none';
      return;
    }
    
    if (password !== confirm) {
      this.newConfirmError.textContent = 'Passwords do not match';
      this.newConfirmError.style.display = 'block';
    } else {
      this.newConfirmError.style.display = 'none';
    }
  }

  openSettings() {
    this.settingsModal.style.display = 'flex';
    this.currentPassword.focus();
  }

  closeSettings() {
    this.settingsModal.style.display = 'none';
    this.changePasswordForm.reset();
    this.newPasswordStrength.style.display = 'none';
    this.newConfirmError.style.display = 'none';
  }

  async handlePasswordChange(e) {
    e.preventDefault();
    
    const current = this.currentPassword.value;
    const newPass = this.newPassword.value;
    const confirm = this.confirmNewPassword.value;
    
    if (newPass !== confirm) {
      this.newConfirmError.textContent = 'Passwords do not match';
      this.newConfirmError.style.display = 'block';
      return;
    }
    
    if (newPass.length < 8) {
      this.newConfirmError.textContent = 'Password must be at least 8 characters long';
      this.newConfirmError.style.display = 'block';
      return;
    }
    
    try {
      const result = await ipcRenderer.invoke('change-password', current, newPass);
      if (result.success) {
        this.showStatus('Password changed successfully!', 'success');
        this.closeSettings();
      } else {
        this.showStatus(result.error || 'Failed to change password', 'error');
      }
    } catch (error) {
      this.showStatus('Error changing password', 'error');
    }
  }

  async loadEntries() {
    try {
      const result = await ipcRenderer.invoke('get-all-entries');
      if (result.success) {
        this.entries = result.dates;
        this.calendarYear = (new Date()).getFullYear();
        this.calendarMonth = (new Date()).getMonth();
        this.renderEntriesList();
        this.renderCalendar();
      } else {
        this.showStatus('Failed to load entries', 'error');
      }
    } catch (error) {
      this.showStatus('Error loading entries', 'error');
    }
  }

  async renderEntriesList() {
    // If the search bar is empty, show all entry dates (no highlights/snippets)
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      this.entriesList.innerHTML = '';
      if (this.entries.length === 0) {
        this.entriesList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No entries yet</div>';
        return;
      }
      this.entries.forEach(date => {
        const entryItem = document.createElement('div');
        entryItem.className = 'entry-item';
        entryItem.innerHTML = `
          <span class="entry-date">${this.formatDate(date, this.dateFormatSelect.value)}</span>
          <button class="delete-btn" onclick="app.deleteEntry('${date}')" title="Delete entry">×</button>
        `;
        entryItem.addEventListener('click', (e) => {
          if (e.target.classList.contains('delete-btn')) return;
          this.selectEntry(date);
        });
        this.entriesList.appendChild(entryItem);
      });
      return;
    }

    this.entriesList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Searching...</div>';

    // Fetch the content of all entries in parallel
    const entryPromises = this.entries.map(async (date) => {
      let content = '';
      try {
        const result = await ipcRenderer.invoke('load-entry', date);
        if (result.success) content = result.content;
      } catch {}
      return { date, content };
    });

    const entryObjects = await Promise.all(entryPromises);

    // Add search variable for highlighting
    const search = this.searchQuery || '';

    // Now filter by search query in either date or content
    const filteredEntries = entryObjects.filter(entryObj =>
      entryObj.content.toLowerCase().includes(search) ||
      this.formatDate(entryObj.date, this.dateFormatSelect.value).toLowerCase().includes(search)
    );

    // Show "No entries yet" if nothing matches
    if (filteredEntries.length === 0) {
      this.entriesList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No entries yet</div>';
      return;
    }

    this.entriesList.innerHTML = '';
    filteredEntries.forEach(entryObj => {
      const entryItem = document.createElement('div');
      entryItem.className = 'entry-item';
      const formattedDate = this.formatDate(entryObj.date, this.dateFormatSelect.value);
      const highlightedDate = this.highlightText(formattedDate, search);
      // Only show the date in the sidebar, not the snippet
      entryItem.innerHTML = `
        <span class="entry-date">${highlightedDate}</span>
        <button class="delete-btn" onclick="app.deleteEntry('${entryObj.date}')" title="Delete entry">×</button>
      `;
      entryItem.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) return;
        this.selectEntry(entryObj.date);
      });
      this.entriesList.appendChild(entryItem);
    });
  }

  formatDate(dateString, format) {
    const date = new Date(dateString);
    switch (format || (this.dateFormatSelect && this.dateFormatSelect.value)) {
      case 'EU':
        return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
      case 'ISO':
        return date.toISOString().slice(0, 10);
      case 'US':
      default:
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }

  createNewEntry() {
    // Always create/select an entry for today (local date)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    this.selectEntry(dateStr, true);
  }

  async selectEntry(date, isNew = false) {
    // Save current entry if there are unsaved changes
    if (this.isUnsaved && this.currentDate) {
      await this.saveCurrentEntry();
    }

    this.currentDate = date;
    if (!this.openTabs.includes(date)) {
      this.openTabs.push(date);
    }
    this.updateActiveEntry();
    this.renderTabs();
    
    // Show editor and hide empty state
    this.emptyState.style.display = 'none';
    this.journalEditor.style.display = 'block';
    
    // Load entry content
    try {
      const result = await ipcRenderer.invoke('load-entry', date);
      if (result.success) {
        this.journalEditor.value = result.content;
        this.isUnsaved = false;
        
        if (isNew && result.content === '') {
          this.journalEditor.focus();
        }
        // Highlight search term in editor if search is active
        if (this.searchQuery && this.searchQuery.length > 0) {
          const idx = this.journalEditor.value.toLowerCase().indexOf(this.searchQuery.toLowerCase());
          if (idx !== -1) {
            this.journalEditor.focus();
            this.journalEditor.setSelectionRange(idx, idx + this.searchQuery.length);
          }
        }
      } else {
        this.showStatus('Failed to load entry', 'error');
      }
    } catch (error) {
      this.showStatus('Error loading entry', 'error');
    }
  }

  renderTabs() {
    // Ensure the dynamic tab area is cleared before re-rendering tabs
    this.editorTabs = document.getElementById('editorTabs');
    this.editorTabs.innerHTML = '';

    if (!this.openTabs.length) {
      const defaultTab = document.createElement('button');
      defaultTab.className = 'tab-btn active';
      defaultTab.textContent = 'New Tab';
      this.editorTabs.appendChild(defaultTab);
      // Show the empty state, hide the editor
      this.journalEditor.style.display = 'none';
      this.emptyState.style.display = 'flex';
      return;
    }

    this.openTabs.forEach(date => {
      const tabBtn = document.createElement('button');
      tabBtn.className = 'tab-btn' + (date === this.currentDate ? ' active' : '');
      tabBtn.textContent = this.formatDate(date, this.dateFormatSelect.value);

      // Add a close "×" button to each tab
      const closeBtn = document.createElement('span');
      closeBtn.textContent = ' ×';
      closeBtn.style.marginLeft = '8px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.closeTab(date);
      };

      tabBtn.appendChild(closeBtn);
      tabBtn.onclick = () => this.selectEntry(date);
      this.editorTabs.appendChild(tabBtn);
    });
  }

  closeTab(date) {
    this.openTabs = this.openTabs.filter(d => d !== date);
    // If the current tab is closed, switch to the last open tab or hide editor
    if (this.currentDate === date) {
      this.currentDate = this.openTabs[this.openTabs.length - 1] || null;
      if (this.currentDate) {
        this.selectEntry(this.currentDate);
      } else {
        this.journalEditor.style.display = 'none';
        this.emptyState.style.display = 'flex';
        this.renderTabs();
      }
    } else {
      this.renderTabs();
    }
  }

  updateActiveEntry() {
    // Remove active class from all entries
    document.querySelectorAll('.entry-item').forEach(item => {
      item.classList.remove('active');
    });
    
    // Add active class to current entry
    const entryItems = document.querySelectorAll('.entry-item');
    entryItems.forEach(item => {
      const dateText = item.querySelector('.entry-date').textContent;
      if (this.formatDate(this.currentDate, this.dateFormatSelect.value) === dateText) {
        item.classList.add('active');
      }
    });
  }

  refreshDates() {
    // Get the latest format from the dropdown (or settings)
    const format = this.dateFormatSelect.value || 'US';
    // Update entries list
    this.renderEntriesList();
  }

  async saveCurrentEntry() {
    if (!this.currentDate) return;
    
    const content = this.journalEditor.value;
    
    try {
      const result = await ipcRenderer.invoke('save-entry', this.currentDate, content);
      if (result.success) {
        this.isUnsaved = false;
        this.showStatus('Entry saved and encrypted!', 'success');
        
        // Add to entries list if it's new
        if (!this.entries.includes(this.currentDate)) {
          this.entries.unshift(this.currentDate);
          this.entries.sort((a, b) => new Date(b) - new Date(a));
          this.renderEntriesList();
          this.updateActiveEntry();
        }
        this.renderCalendar();
      } else {
        this.showStatus('Failed to save entry', 'error');
      }
    } catch (error) {
      this.showStatus('Error saving entry', 'error');
    }
  }

  async deleteEntry(date) {
    if (!confirm(`Are you sure you want to delete the entry for ${this.formatDate(date)}?`)) {
      return;
    }
    
    try {
      const result = await ipcRenderer.invoke('delete-entry', date);
      if (result.success) {
        this.entries = this.entries.filter(d => d !== date);
        this.openTabs = this.openTabs.filter(d => d !== date);
        this.renderEntriesList();
        this.renderCalendar();
        // If we deleted the current entry, show empty state
        if (this.currentDate === date) {
          this.currentDate = null;
          this.journalEditor.style.display = 'none';
          this.emptyState.style.display = 'flex';
        }
        
        this.showStatus('Entry deleted', 'success');
      } else {
        this.showStatus('Failed to delete entry', 'error');
      }
    } catch (error) {
      this.showStatus('Error deleting entry', 'error');
    }
  }

  markAsUnsaved() {
    this.isUnsaved = true;
  }


  showStatus(message, type) {
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message ${type} show`;
    
    setTimeout(() => {
      this.statusMessage.classList.remove('show');
    }, 3000);
  }
  async autoSaveEntry() {
    if (!this.currentDate) return;
    const content = this.journalEditor.value;
    try {
      const result = await ipcRenderer.invoke('save-entry', this.currentDate, content);
      if (result.success) {
        this.isUnsaved = false;
        if (!this.entries.includes(this.currentDate)) {
          this.entries.unshift(this.currentDate);
          this.entries.sort((a, b) => new Date(b) - new Date(a));
          this.renderEntriesList();
          this.updateActiveEntry();
        }
        this.renderCalendar();
      }
    } catch (error) {
      // Optionally handle autosave errors here
    }
  }
  // --- Calendar methods start here ---
  renderCalendar() {
    const calendarTitle = document.getElementById('calendarTitle');
    const calendarDays = document.getElementById('calendarDays');
    const calendarMessage = document.getElementById('calendarMessage');
    if (!calendarTitle || !calendarDays || !calendarMessage) return;

    // Set the title
    calendarTitle.textContent = `${this.getMonthName(this.calendarMonth)} ${this.calendarYear}`;

    // Navigation buttons
    document.getElementById('calPrevMonth').onclick = () => {
      if (this.calendarMonth === 0) {
        this.calendarMonth = 11;
        this.calendarYear -= 1;
      } else {
        this.calendarMonth -= 1;
      }
      this.renderCalendar();
    };
    document.getElementById('calNextMonth').onclick = () => {
      if (this.calendarMonth === 11) {
        this.calendarMonth = 0;
        this.calendarYear += 1;
      } else {
        this.calendarMonth += 1;
      }
      this.renderCalendar();
    };

    // Clear days grid and message
    calendarDays.innerHTML = '';
    calendarMessage.textContent = '';

    // Find first and last day of the month
    const firstDay = new Date(this.calendarYear, this.calendarMonth, 1);
    const lastDay = new Date(this.calendarYear, this.calendarMonth + 1, 0);

    // Determine the starting day for grid (including days from previous month)
    const startDayOfWeek = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
    const daysInPrevMonth = new Date(this.calendarYear, this.calendarMonth, 0).getDate();

    // Get all entry dates for this month and adjacent days
    const entryDates = new Set(this.entries);

    // Fill days: up to 6 rows of 7 columns (42 cells)
    let cells = [];
    // Days from previous month
    for (let i = 0; i < startDayOfWeek; i++) {
      const prevDate = new Date(this.calendarYear, this.calendarMonth - 1, daysInPrevMonth - startDayOfWeek + i + 1);
      const dateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
      cells.push({ 
        day: prevDate.getDate(), 
        className: 'calendar-day inactive', 
        dateStr 
      });
    }
    // Days of this month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      let className = 'calendar-day';
      const today = new Date();
      if (
        d === today.getDate() &&
        this.calendarYear === today.getFullYear() &&
        this.calendarMonth === today.getMonth()
      ) {
        className += ' today';
      }
      if (entryDates.has(dateStr)) {
        className += ' has-entry';
      }
      cells.push({ day: d, className, dateStr });
    }
    // Days from next month (to fill 42 cells)
    while (cells.length < 42) {
      const nextDay = cells.length - (startDayOfWeek + lastDay.getDate()) + 1;
      const nextDate = new Date(this.calendarYear, this.calendarMonth + 1, nextDay);
      const dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
      cells.push({ 
        day: nextDate.getDate(), 
        className: 'calendar-day inactive', 
        dateStr
      });
    }
    // Render the cells
    cells.forEach(({ day, className, dateStr }) => {
      const cell = document.createElement('div');
      cell.className = className;
      cell.textContent = day;
      cell.setAttribute('data-datestr', dateStr);
      if (!className.includes('inactive')) {
        cell.onclick = () => this.handleCalendarDayClick(
          Number(dateStr.slice(0, 4)),
          Number(dateStr.slice(5, 7)) - 1,
          Number(dateStr.slice(8, 10))
        );
      }
      calendarDays.appendChild(cell);
    });
  }

  handleCalendarDayClick(year, month, day) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const today = new Date();
    const clickedDate = new Date(year, month, day);

    // Prevent creating entries for future dates
    if (clickedDate > new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      return; // Do nothing for future dates
    }

    if (this.entries.includes(dateStr)) {
      this.selectEntry(dateStr);
      this.hideCalendarHoverMessage();
    } else {
      // Instantly create/select a new entry for allowed dates (past/today)
      this.selectEntry(dateStr, true);
      // Show a floating "No Entry Found" message on hover for 1.2s
      this.showCalendarHoverMessage(year, month, day);
    }
  }

  showCalendarHoverMessage(year, month, day) {
    this.hideCalendarHoverMessage();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const days = document.querySelectorAll('.calendar-day');
    let cell = null;
    days.forEach(d => {
      if (
        Number(d.textContent) === day &&
        !d.classList.contains('inactive') &&
        d.getAttribute('data-datestr') === dateStr
      ) cell = d;
    });
    if (!cell) return;
    const msg = document.createElement('div');
    msg.className = 'calendar-hover-message';
    msg.textContent = 'No Entry Found';
    const rect = cell.getBoundingClientRect();
    msg.style.left = rect.left + window.scrollX + 'px';
    msg.style.top = (rect.top + window.scrollY - 32) + 'px';
    msg.id = 'calendarHoverMsg';
    document.body.appendChild(msg);

    this._calendarHoverTimeout = setTimeout(this.hideCalendarHoverMessage, 1200);
  }

  hideCalendarHoverMessage() {
    if (this._calendarHoverTimeout) clearTimeout(this._calendarHoverTimeout);
    const oldMsg = document.getElementById('calendarHoverMsg');
    if (oldMsg) oldMsg.remove();
  }
}

// Initialize the app when the DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new SecureJournalApp();
});

// Prevent the app from closing if there are unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (app && app.isUnsaved) {
    e.preventDefault();
    e.returnValue = '';
  }
});
