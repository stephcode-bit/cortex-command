const app = {
  data: {
    tasks: [],
    decisions: [],
    thoughts: [],
    focusSessions: 0,
    totalFocusMinutes: 0,
    energy: 80,
    currentView: 'dashboard',
    focusDuration: 25,
    focusRunning: false,
    focusTimeLeft: 25 * 60,
    focusInterval: null,
    activeQuadrant: null,
    theme: 'dark',
    notifications: [],
    streakDays: [],
    lastActiveDate: null
  },

  quotes: [
    { text: "The mind is for having ideas, not holding them.", author: "David Allen" },
    { text: "What is important is seldom urgent and what is urgent is seldom important.", author: "Dwight Eisenhower" },
    { text: "Your calm mind is the ultimate weapon against your challenges.", author: "Bryant McGill" },
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
    { text: "The best way to predict the future is to create it.", author: "Peter Drucker" }
  ],

  init() {
    this.loadData();
    this.setupNavigation();
    this.setupMobileMenu();
    this.setupEnergySlider();
    this.setupFocusTimer();
    this.setupThemeToggle();
    this.setupNotifications();
    this.setupStreakTracking();
    this.updateDate();
    this.updateDashboard();
    this.renderTasks();
    this.renderDecisions();
    this.renderThoughts();
    this.updateFocusStats();
    this.setGreeting();
    this.setDailyQuote();
    this.renderNotifications();
    this.checkDueTasks();

    // Check URL hash for direct navigation
    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById(`view-${hash}`)) {
      this.navigate(hash);
    }

    // Save on page unload
    window.addEventListener('beforeunload', () => this.saveData());

    // Periodic save
    setInterval(() => this.saveData(), 30000);

    // Check for due tasks every minute
    setInterval(() => this.checkDueTasks(), 60000);
  },

  /* ============================================
     THEME / DARK MODE
     ============================================ */
  setupThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    toggle.addEventListener('click', () => this.toggleTheme());

    // Apply saved theme
    if (this.data.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  },

  toggleTheme() {
    this.data.theme = this.data.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.data.theme);
    this.saveData();

    const msg = this.data.theme === 'dark' ? 'Dark mode enabled' : 'Light mode enabled';
    this.showToast(msg, 'info');
  },

  /* ============================================
     NOTIFICATIONS SYSTEM
     ============================================ */
  setupNotifications() {
    const bell = document.getElementById('notificationBell');
    const dropdown = document.getElementById('notificationDropdown');

    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
      // Mark all as read when opened
      if (dropdown.classList.contains('active')) {
        this.data.notifications.forEach(n => n.read = true);
        this.renderNotifications();
        this.saveData();
      }
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !bell.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });

    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },

  addNotification(title, body, type = 'info') {
    const notification = {
      id: Date.now(),
      title,
      body,
      type,
      read: false,
      timestamp: new Date().toISOString()
    };

    this.data.notifications.unshift(notification);
    // Keep only last 20
    if (this.data.notifications.length > 20) {
      this.data.notifications = this.data.notifications.slice(0, 20);
    }

    this.saveData();
    this.renderNotifications();

    // Show toast
    this.showToast(`${title}: ${body}`, type);

    // Browser notification for important ones
    if (type === 'warning' || type === 'error') {
      this.sendBrowserNotification(title, body);
    }
  },

  renderNotifications() {
    const list = document.getElementById('notificationList');
    const badge = document.getElementById('notificationBadge');
    const unread = this.data.notifications.filter(n => !n.read);

    if (unread.length > 0) {
      badge.textContent = unread.length > 9 ? '9+' : unread.length;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }

    if (this.data.notifications.length === 0) {
      list.innerHTML = '<div class="notification-empty">No notifications yet</div>';
      return;
    }

    list.innerHTML = this.data.notifications.map(n => `
      <div class="notification-item ${n.read ? '' : 'unread'}" onclick="app.readNotification(${n.id})">
        <div class="notification-dot"></div>
        <div class="notification-content">
          <div class="notification-title">${this.escapeHtml(n.title)}</div>
          <div class="notification-body">${this.escapeHtml(n.body)}</div>
          <div class="notification-time">${this.timeAgo(n.timestamp)}</div>
        </div>
      </div>
    `).join('');
  },

  readNotification(id) {
    const n = this.data.notifications.find(n => n.id === id);
    if (n) {
      n.read = true;
      this.saveData();
      this.renderNotifications();
    }
  },

  clearNotifications() {
    this.data.notifications = [];
    this.saveData();
    this.renderNotifications();
    this.showToast('All notifications cleared', 'info');
  },

  sendBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'favicon.svg',
        badge: 'favicon.svg'
      });
    }
  },

  timeAgo(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  },

  checkDueTasks() {
    const today = new Date().toISOString().split('T')[0];
    const dueTasks = this.data.tasks.filter(t => {
      if (!t.due || t.completed) return false;
      return t.due <= today;
    });

    if (dueTasks.length > 0) {
      const existingAlert = this.data.notifications.find(n => 
        n.title === 'Tasks Due' && n.body.includes(`${dueTasks.length} task`)
      );
      if (!existingAlert) {
        this.addNotification(
          'Tasks Due',
          `You have ${dueTasks.length} task${dueTasks.length > 1 ? 's' : ''} due today`,
          'warning'
        );
      }
    }
  },

  /* ============================================
     STREAK TRACKING & FLASH CARD
     ============================================ */
  setupStreakTracking() {
    const today = new Date().toISOString().split('T')[0];

    // Track daily activity for streak
    if (this.data.lastActiveDate !== today) {
      if (this.data.lastActiveDate) {
        const last = new Date(this.data.lastActiveDate);
        const curr = new Date(today);
        const diff = Math.floor((curr - last) / (1000 * 60 * 60 * 24));

        if (diff === 1) {
          // Consecutive day
        } else if (diff > 1) {
          // Streak broken
          this.data.streakDays = [];
        }
      }
      this.data.lastActiveDate = today;
      this.saveData();
    }
  },

  getStreakCount() {
    return this.data.streakDays.length;
  },

  recordActivity() {
    const today = new Date().toISOString().split('T')[0];
    if (!this.data.streakDays.includes(today)) {
      this.data.streakDays.push(today);
      this.saveData();
    }
  },

  openStreakModal() {
    const modal = document.getElementById('streakModal');
    const streak = this.getStreakCount();
    const completedTasks = this.data.tasks.filter(t => t.completed).length;

    document.getElementById('streakNumber').textContent = streak;
    document.getElementById('streakCardSessions').textContent = this.data.focusSessions;
    document.getElementById('streakCardMinutes').textContent = this.data.totalFocusMinutes;
    document.getElementById('streakCardTasks').textContent = completedTasks;
    document.getElementById('streakCardDate').textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    modal.classList.add('active');

    // Close on overlay tap/click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeStreakModal();
      }
    });
  },

  closeStreakModal() {
    document.getElementById('streakModal').classList.remove('active');
  },

  copyStreakCard() {
    const streak = this.getStreakCount();
    const completedTasks = this.data.tasks.filter(t => t.completed).length;
    const text = `🔥 ${streak}-Day Streak on Cortex

📊 Stats:
• ${this.data.focusSessions} Focus Sessions
• ${this.data.totalFocusMinutes} Minutes Focused
• ${completedTasks} Tasks Completed

Stay productive. Stay organized.
🔗 cortex-command.vercel.app`;

    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Streak copied to clipboard!', 'success');
    }).catch(() => {
      this.showToast('Failed to copy. Try sharing instead.', 'error');
    });
  },

  shareStreakNative() {
    const streak = this.getStreakCount();
    const completedTasks = this.data.tasks.filter(t => t.completed).length;
    const shareData = {
      title: `${streak}-Day Streak on Cortex`,
      text: `I'm on a ${streak}-day productivity streak! ${this.data.focusSessions} focus sessions, ${this.data.totalFocusMinutes} minutes, ${completedTasks} tasks done.`,
      url: 'https://cortex-command.vercel.app'
    };

    if (navigator.share) {
      navigator.share(shareData).catch(() => {
        this.copyStreakCard();
      });
    } else {
      this.copyStreakCard();
    }
  },

  /* ============================================
     NAVIGATION
     ============================================ */
  setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        this.navigate(view);
      });
    });
  },

  navigate(view) {
    this.data.currentView = view;

    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(`view-${view}`);
    if (targetView) targetView.classList.add('active');

    const titles = {
      dashboard: 'Dashboard',
      matrix: 'Priority Matrix',
      braindump: 'Brain Dump',
      decisions: 'Decision Ledger',
      focus: 'Focus Mode'
    };
    document.getElementById('pageTitle').textContent = titles[view] || 'Dashboard';

    window.location.hash = view;
    this.closeSidebar();

    if (view === 'dashboard') this.updateDashboard();
    if (view === 'matrix') this.renderTasks();
    if (view === 'decisions') this.renderDecisions();
  },

  setupMobileMenu() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const closeBtn = document.getElementById('sidebarClose');

    menuToggle.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('active');
    });

    const close = () => this.closeSidebar();
    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
  },

  closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
  },

  /* ============================================
     DASHBOARD
     ============================================ */
  updateDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('dateDisplay').textContent = now.toLocaleDateString('en-US', options);
  },

  setGreeting() {
    const hour = new Date().getHours();
    let greeting = 'morning';
    if (hour >= 12 && hour < 17) greeting = 'afternoon';
    else if (hour >= 17) greeting = 'evening';
    document.getElementById('greeting').textContent = greeting;
  },

  setDailyQuote() {
    const day = new Date().getDate();
    const quote = this.quotes[day % this.quotes.length];
    document.querySelector('#dailyQuote').textContent = `"${quote.text}"`;
    document.querySelector('.quote-card cite').textContent = `— ${quote.author}`;
  },

  updateDashboard() {
    const activeTasks = this.data.tasks.filter(t => !t.completed).length;
    const totalDecisions = this.data.decisions.length;
    const totalFocus = this.data.totalFocusMinutes;

    document.getElementById('taskCount').textContent = activeTasks;
    document.getElementById('statTasks').textContent = activeTasks;
    document.getElementById('statDecisions').textContent = totalDecisions;
    document.getElementById('statFocus').textContent = `${totalFocus}m`;
    document.getElementById('statEnergy').textContent = `${this.data.energy}%`;

    const recentDecisions = this.data.decisions.slice(-3).reverse();
    const container = document.getElementById('recentDecisions');
    if (recentDecisions.length === 0) {
      container.innerHTML = '<p>No decisions logged yet. Start your Decision Ledger.</p>';
      container.className = 'empty-state';
    } else {
      container.className = 'decisions-preview';
      container.innerHTML = recentDecisions.map(d => `
        <div class="decision-preview-item">
          <div class="decision-preview-title">${this.escapeHtml(d.title)}</div>
          <div class="decision-preview-date">${new Date(d.date).toLocaleDateString()}</div>
        </div>
      `).join('');
    }
  },

  /* ============================================
     PRIORITY MATRIX (Tasks)
     ============================================ */
  addTask(quadrant) {
    this.data.activeQuadrant = quadrant;
    document.getElementById('taskModal').classList.add('active');
    document.getElementById('taskInput').value = '';
    document.getElementById('taskNotes').value = '';
    document.getElementById('taskDue').value = '';
    document.getElementById('taskPriority').value = 'medium';
    document.getElementById('taskInput').focus();
  },

  saveTask() {
    const title = document.getElementById('taskInput').value.trim();
    if (!title) {
      this.showToast('Please enter a task title', 'warning');
      return;
    }

    const task = {
      id: Date.now(),
      title,
      notes: document.getElementById('taskNotes').value.trim(),
      due: document.getElementById('taskDue').value,
      priority: document.getElementById('taskPriority').value,
      quadrant: this.data.activeQuadrant,
      completed: false,
      createdAt: new Date().toISOString()
    };

    this.data.tasks.push(task);
    this.recordActivity();
    this.saveData();
    this.renderTasks();
    this.updateDashboard();
    this.closeModal();
    this.showToast('Task added to Priority Matrix', 'success');

    if (task.due) {
      this.addNotification('Task Created', `"${task.title}" is due ${task.due}`, 'info');
    }
  },

  toggleTask(id) {
    const task = this.data.tasks.find(t => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.recordActivity();
      this.saveData();
      this.renderTasks();
      this.updateDashboard();

      if (task.completed) {
        this.showToast('Task completed! Great work.', 'success');
        this.addNotification('Task Completed', `"${task.title}" marked as done`, 'success');
      }
    }
  },

  deleteTask(id) {
    const task = this.data.tasks.find(t => t.id === id);
    this.data.tasks = this.data.tasks.filter(t => t.id !== id);
    this.saveData();
    this.renderTasks();
    this.updateDashboard();
    this.showToast('Task deleted', 'info');
  },

  renderTasks() {
    const quadrants = ['q1', 'q2', 'q3', 'q4'];
    quadrants.forEach(q => {
      const container = document.getElementById(`${q}List`);
      const tasks = this.data.tasks.filter(t => t.quadrant === q);

      if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px; font-size: 0.8rem;"><p>No tasks yet</p></div>';
      } else {
        container.innerHTML = tasks.map(task => `
          <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
            <div class="task-checkbox ${task.completed ? 'checked' : ''}" onclick="app.toggleTask(${task.id})"></div>
            <div class="task-content">
              <div class="task-text">${this.escapeHtml(task.title)}</div>
              <div class="task-meta">
                ${task.due ? `<span>Due ${new Date(task.due).toLocaleDateString()}</span>` : ''}
                <span class="task-priority priority-${task.priority}">${task.priority}</span>
              </div>
            </div>
            <button class="task-delete" onclick="app.deleteTask(${task.id})">×</button>
          </div>
        `).join('');
      }
    });
  },

  /* ============================================
     BRAIN DUMP
     ============================================ */
  captureBrainDump() {
    const input = document.getElementById('braindumpInput');
    const text = input.value.trim();
    if (!text) {
      this.showToast('Type something first!', 'warning');
      return;
    }

    const thoughts = text.split('\n').map(t => t.trim()).filter(t => t.length > 0);

    thoughts.forEach(thought => {
      this.data.thoughts.push({
        id: Date.now() + Math.random(),
        text: thought,
        createdAt: new Date().toISOString()
      });
    });

    input.value = '';
    this.recordActivity();
    this.saveData();
    this.renderThoughts();
    this.showToast(`${thoughts.length} thought${thoughts.length > 1 ? 's' : ''} captured`, 'success');
  },

  categorizeDump() {
    this.captureBrainDump();
    this.showToast('Review your thoughts in the Priority Matrix', 'info');
    setTimeout(() => this.navigate('matrix'), 1500);
  },

  renderThoughts() {
    const container = document.getElementById('capturedThoughts');
    const thoughts = [...this.data.thoughts].reverse();

    if (thoughts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <p>Your captured thoughts will appear here. Start dumping!</p>
        </div>`;
    } else {
      container.innerHTML = thoughts.map(t => `
        <div class="thought-item">
          <div class="thought-bullet"></div>
          <div class="thought-text">${this.escapeHtml(t.text)}</div>
          <div class="thought-actions">
            <button class="thought-btn" onclick="app.promoteToTask(${t.id}, 'q2')">Schedule</button>
            <button class="thought-btn" onclick="app.promoteToTask(${t.id}, 'q1')">Urgent</button>
            <button class="thought-btn" onclick="app.deleteThought(${t.id})" style="color: var(--accent-danger);">Delete</button>
          </div>
        </div>
      `).join('');
    }
  },

  promoteToTask(thoughtId, quadrant) {
    const thought = this.data.thoughts.find(t => t.id === thoughtId);
    if (!thought) return;

    this.data.tasks.push({
      id: Date.now(),
      title: thought.text,
      notes: '',
      due: '',
      priority: quadrant === 'q1' ? 'high' : 'medium',
      quadrant,
      completed: false,
      createdAt: new Date().toISOString()
    });

    this.data.thoughts = this.data.thoughts.filter(t => t.id !== thoughtId);
    this.recordActivity();
    this.saveData();
    this.renderThoughts();
    this.renderTasks();
    this.updateDashboard();
    this.showToast('Promoted to Priority Matrix', 'success');
  },

  deleteThought(id) {
    this.data.thoughts = this.data.thoughts.filter(t => t.id !== id);
    this.saveData();
    this.renderThoughts();
    this.showToast('Thought deleted', 'info');
  },

  /* ============================================
     DECISION LEDGER
     ============================================ */
  addOption() {
    const container = document.getElementById('optionsList');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'option-input';
    input.placeholder = `Option ${container.children.length + 1}`;
    container.appendChild(input);
    input.focus();
  },

  logDecision() {
    const title = document.getElementById('decisionTitle').value.trim();
    const context = document.getElementById('decisionContext').value.trim();
    const reasoning = document.getElementById('decisionReasoning').value.trim();
    const outcome = document.getElementById('decisionOutcome').value;

    if (!title) {
      this.showToast('Please enter a decision title', 'warning');
      return;
    }

    const options = Array.from(document.querySelectorAll('.option-input'))
      .map(i => i.value.trim())
      .filter(v => v);

    const decision = {
      id: Date.now(),
      title,
      context,
      options,
      reasoning,
      outcome,
      date: new Date().toISOString()
    };

    this.data.decisions.push(decision);
    this.recordActivity();
    this.saveData();
    this.renderDecisions();
    this.updateDashboard();

    document.getElementById('decisionTitle').value = '';
    document.getElementById('decisionContext').value = '';
    document.getElementById('decisionReasoning').value = '';
    document.querySelectorAll('.option-input').forEach((input, i) => {
      if (i < 2) input.value = '';
      else input.remove();
    });

    this.showToast('Decision logged successfully', 'success');
    this.addNotification('Decision Logged', `"${title}" recorded in your ledger`, 'success');
  },

  renderDecisions() {
    const container = document.getElementById('decisionsList');
    const decisions = [...this.data.decisions].reverse();

    if (decisions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <p>No decisions logged yet. Start building your decision-making muscle.</p>
        </div>`;
    } else {
      container.innerHTML = decisions.map(d => `
        <div class="decision-card">
          <div class="decision-title">${this.escapeHtml(d.title)}</div>
          <div class="decision-meta">
            <span>${new Date(d.date).toLocaleDateString()}</span>
            <span class="decision-outcome outcome-${d.outcome}">${d.outcome}</span>
          </div>
          ${d.context ? `<div class="decision-context">${this.escapeHtml(d.context)}</div>` : ''}
          ${d.options.length > 0 ? `
            <div class="decision-options">
              ${d.options.map(o => `<span class="decision-option">${this.escapeHtml(o)}</span>`).join('')}
            </div>
          ` : ''}
          ${d.reasoning ? `<div class="decision-reasoning">${this.escapeHtml(d.reasoning)}</div>` : ''}
          <button class="btn-text" onclick="app.deleteDecision(${d.id})" style="margin-top: 8px; color: var(--accent-danger);">Delete</button>
        </div>
      `).join('');
    }
  },

  deleteDecision(id) {
    this.data.decisions = this.data.decisions.filter(d => d.id !== id);
    this.saveData();
    this.renderDecisions();
    this.updateDashboard();
    this.showToast('Decision removed', 'info');
  },

  /* ============================================
     FOCUS MODE
     ============================================ */
  setupFocusTimer() {
    document.querySelectorAll('.duration-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.data.focusRunning) return;
        document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.data.focusDuration = parseInt(btn.dataset.duration);
        this.data.focusTimeLeft = this.data.focusDuration * 60;
        this.updateFocusDisplay();
      });
    });
  },

  toggleFocus() {
    if (this.data.focusRunning) {
      this.pauseFocus();
    } else {
      this.startFocus();
    }
  },

  startFocus() {
    this.data.focusRunning = true;
    document.getElementById('focusRing').classList.add('active');
    document.getElementById('focusLabel').textContent = 'Focusing...';
    document.getElementById('focusStart').innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      Pause
    `;

    this.data.focusInterval = setInterval(() => {
      this.data.focusTimeLeft--;
      this.updateFocusDisplay();

      if (this.data.focusTimeLeft <= 0) {
        this.completeFocus();
      }
    }, 1000);

    this.addNotification('Focus Started', `${this.data.focusDuration} minute session began`, 'info');
  },

  pauseFocus() {
    this.data.focusRunning = false;
    clearInterval(this.data.focusInterval);
    document.getElementById('focusRing').classList.remove('active');
    document.getElementById('focusLabel').textContent = 'Paused';
    document.getElementById('focusStart').innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Resume
    `;

    this.addNotification('Focus Paused', 'Timer paused. Ready when you are.', 'warning');
  },

  resetFocus() {
    this.pauseFocus();
    this.data.focusTimeLeft = this.data.focusDuration * 60;
    document.getElementById('focusLabel').textContent = 'Ready to Focus';
    document.getElementById('focusStart').innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Start Focus
    `;
    this.updateFocusDisplay();
  },

  completeFocus() {
    this.pauseFocus();
    this.data.focusSessions++;
    this.data.totalFocusMinutes += this.data.focusDuration;
    this.recordActivity();
    this.saveData();
    this.updateFocusStats();

    document.getElementById('focusLabel').textContent = 'Session Complete!';
    document.getElementById('focusStart').innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Start Focus
    `;

    this.data.focusTimeLeft = this.data.focusDuration * 60;
    this.updateFocusDisplay();

    this.showToast(`Great work! ${this.data.focusDuration} minutes of deep focus`, 'success');
    this.addNotification('Focus Complete', `${this.data.focusDuration} minute session finished!`, 'success');
    this.sendBrowserNotification('Focus Complete', `You completed a ${this.data.focusDuration} minute focus session!`);
  },

  updateFocusDisplay() {
    const minutes = Math.floor(this.data.focusTimeLeft / 60);
    const seconds = this.data.focusTimeLeft % 60;
    document.getElementById('focusTime').textContent = 
      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  },

  updateFocusStats() {
    document.getElementById('totalFocusSessions').textContent = this.data.focusSessions;
    document.getElementById('totalFocusTime').textContent = `${this.data.totalFocusMinutes}m`;
  },

  /* ============================================
     ENERGY SLIDER
     ============================================ */
  setupEnergySlider() {
    const slider = document.getElementById('energySlider');
    const value = document.getElementById('energyValue');

    slider.addEventListener('input', () => {
      this.data.energy = parseInt(slider.value);
      value.textContent = `${this.data.energy}%`;
      this.updateDashboard();
      this.saveData();

      if (this.data.energy < 30) {
        this.addNotification('Low Energy', 'Your energy is running low. Consider a break.', 'warning');
      }
    });
  },

  /* ============================================
     DATA PERSISTENCE
     ============================================ */
  saveData() {
    localStorage.setItem('cortex_data', JSON.stringify(this.data));
  },

  loadData() {
    const saved = localStorage.getItem('cortex_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.assign(this.data, parsed);
        document.getElementById('energySlider').value = this.data.energy;
        document.getElementById('energyValue').textContent = `${this.data.energy}%`;
      } catch (e) {
        console.error('Failed to load data', e);
      }
    }
  },

  /* ============================================
     MODAL
     ============================================ */
  closeModal() {
    document.getElementById('taskModal').classList.remove('active');
  },

  /* ============================================
     TOAST NOTIFICATIONS
     ============================================ */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
      error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    toast.innerHTML = `${icons[type] || icons.info}<span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  /* ============================================
     UTILITIES
     ============================================ */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => app.init());

// Close modal on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    app.closeModal();
    app.closeStreakModal();
  }
});
