/* ============================================================
   Main Application Controller
   ============================================================ */
var App = class App {
  constructor() {
    this.pages = {};
    this.currentPage = null;
    this.chartInstances = {};
    this.ADMIN_EMAILS = ['agewaller@gmail.com'];
    // Load additional admins from localStorage
    try {
      const extra = JSON.parse(localStorage.getItem('admin_emails') || '[]');
      if (Array.isArray(extra)) this.ADMIN_EMAILS = [...new Set([...this.ADMIN_EMAILS, ...extra])];
    } catch(e) {}
  }

  isAdmin() {
    const user = store.get('user');
    return user && this.ADMIN_EMAILS.includes(user.email);
  }

  init() {
    // Force light theme always
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('cc_theme');
    store.on('currentPage', (p) => this.navigate(p));

    // Initialize Firebase if configured
    if (FirebaseBackend.isConfigured()) {
      const config = FirebaseBackend.getConfig();
      FirebaseBackend.init(config);
      FirebaseBackend.enableAutoSync();
      // Firebase auth will handle navigation via onAuthStateChanged
    } else {
      // No Firebase - use localStorage mode
      if (store.get('isAuthenticated') && store.get('user')) {
        this.navigate(store.get('selectedDisease') ? 'dashboard' : 'disease-select');
      } else {
        this.navigate('login');
      }
    }

    // Set up periodic health score calc
    setInterval(() => store.calculateHealthScore(), 60000);
    store.calculateHealthScore();

    // Load initial calendar data if not yet synced
    if (!(store.get('calendarEvents') || []).length) {
      store.set('calendarEvents', [
        {id:'e1',title:'IOEA 2026',location:'Cargèse, Corsica – France',start:'2026-04-06',end:'2026-04-11',allDay:true,type:'default',attendees:1},
        {id:'e2',title:'♻️資源ごみをすてる（上原）',start:'2026-04-06T06:30:00+09:00',end:'2026-04-06T07:00:00+09:00',allDay:false,type:'default',attendees:1},
        {id:'e3',title:'Reservation at APONTE',location:'APONTE, 目黒区',start:'2026-04-09T19:00:00+09:00',end:'2026-04-09T20:00:00+09:00',allDay:false,type:'default',attendees:1},
        {id:'e4',title:'山口揚平予約 (Sheng Wei)',start:'2026-04-13T12:30:00+09:00',end:'2026-04-13T13:30:00+09:00',allDay:false,type:'default',attendees:2}
      ]);
    }
  }

  // ---- Navigation ----
  navigate(page) {
    // Block non-admin users from admin-only pages
    if (['admin', 'analysis'].includes(page) && !this.isAdmin()) {
      Components.showToast('この機能は管理者専用です', 'error');
      return;
    }

    this.currentPage = page;
    const content = document.getElementById('page-content');
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('top-bar');
    if (!content) return;

    // Hide admin-only nav items for non-admin users
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = this.isAdmin() ? '' : 'none';
    });

    // Show/hide sidebar for login/disease-select
    if (['login', 'disease-select'].includes(page)) {
      if (sidebar) sidebar.style.display = 'none';
      if (topbar) topbar.style.display = 'none';
      document.querySelector('.main-content').style.marginLeft = '0';
    } else {
      if (sidebar) sidebar.style.display = '';
      if (topbar) topbar.style.display = '';
      document.querySelector('.main-content').style.marginLeft = '';
    }

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // Update top bar title
    const titles = {
      dashboard: 'ダッシュボード',
      'data-input': 'データ入力',
      analysis: 'AI分析',
      actions: 'アクションセンター',
      research: '最新研究',
      chat: '相談する',
      integrations: 'デバイス連携',
      timeline: 'タイムライン',
      admin: '管理パネル',
      settings: '設定'
    };
    const titleEl = document.getElementById('top-bar-title');
    if (titleEl) titleEl.textContent = titles[page] || '';

    // Close sidebar on mobile after navigation
    this.closeSidebar();

    // Render page
    const renderer = this['render_' + page.replace(/-/g, '_')];
    if (renderer) {
      try {
        content.innerHTML = renderer.call(this);
        this.afterRender(page);
      } catch(err) {
        console.error('Page render error:', page, err);
        content.innerHTML = `<div style="padding:20px"><p>ページの読み込みエラー</p><p style="font-size:12px;color:#94a3b8">${err.message}</p><button onclick="localStorage.clear();location.reload()" style="margin-top:10px;padding:8px 16px;background:#6C63FF;color:white;border:none;border-radius:8px;cursor:pointer">リセットして再読み込み</button></div>`;
      }
    }
  }

  afterRender(page) {
    if (page === 'dashboard') {
      this.initDashboardCharts();
      setTimeout(() => this.loadDashResearch(), 300);
      setTimeout(() => this.loadActionRecommendations(), 600);
    }
    if (page === 'actions') {
      setTimeout(() => this.loadActionRecommendations(), 300);
    }
    if (page === 'analysis') this.loadLatestAnalysis();
    if (page === 'admin') { this.loadApiKeyFields(); this.loadFirebaseConfigFields(); }
    if (page === 'settings') this.loadProfileFields();
  }

  // ---- API Key Management ----
  // ---- Firebase Config Management ----
  saveFirebaseConfig() {
    const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const config = {};
    let filled = 0;
    fields.forEach(f => {
      const el = document.getElementById('fb-' + f);
      if (el && el.value.trim()) {
        config[f] = el.value.trim();
        filled++;
      }
    });

    if (filled < 3) {
      Components.showToast('API Key, Auth Domain, Project IDは必須です', 'error');
      return;
    }

    FirebaseBackend.saveConfig(config);
    Components.showToast('Firebase設定を保存しました。ページをリロードして接続します...', 'success');
    setTimeout(() => location.reload(), 1500);
  }

  clearFirebaseConfig() {
    localStorage.removeItem('firebase_config');
    Components.showToast('Firebase設定を削除しました。リロード後はローカルモードになります。', 'info');
    setTimeout(() => location.reload(), 1500);
  }

  loadFirebaseConfigFields() {
    const config = FirebaseBackend.getConfig();
    if (!config) return;
    ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'].forEach(f => {
      const el = document.getElementById('fb-' + f);
      if (el && config[f] && config[f] !== 'YOUR_FIREBASE_API_KEY') {
        el.value = config[f];
      }
    });
    const statusEl = document.getElementById('firebase-status');
    if (statusEl) {
      const configured = FirebaseBackend.isConfigured();
      const connected = FirebaseBackend.initialized;
      statusEl.className = 'tag ' + (connected ? 'tag-success' : configured ? 'tag-warning' : 'tag-danger');
      statusEl.textContent = connected ? '接続中' : configured ? '設定済(未接続)' : '未設定';
    }
  }

  loadApiKeyFields() {
    // Load proxy URL
    const proxyEl = document.getElementById('input-proxy-url');
    const proxyStored = localStorage.getItem('anthropic_proxy_url');
    if (proxyEl && proxyStored) proxyEl.value = proxyStored;

    const keys = ['anthropic', 'openai', 'google'];
    keys.forEach(k => {
      const el = document.getElementById('input-apikey-' + k);
      const stored = localStorage.getItem('apikey_' + k);
      if (el && stored) {
        el.value = stored;
      }
    });
    // Update status badge
    const statusEl = document.getElementById('api-key-status');
    if (statusEl) {
      const hasAny = keys.some(k => localStorage.getItem('apikey_' + k));
      statusEl.className = 'tag ' + (hasAny ? 'tag-success' : 'tag-warning');
      statusEl.textContent = hasAny ? 'APIキー設定済' : 'APIキー未設定';
    }
  }

  async saveApiKeys() {
    const keys = ['anthropic', 'openai', 'google'];
    const keyData = {};
    let saved = 0;
    // Save proxy URL
    const proxyEl = document.getElementById('input-proxy-url');
    if (proxyEl && proxyEl.value.trim()) {
      localStorage.setItem('anthropic_proxy_url', proxyEl.value.trim());
      saved++;
    }

    keys.forEach(k => {
      const el = document.getElementById('input-apikey-' + k);
      if (el && el.value.trim()) {
        localStorage.setItem('apikey_' + k, el.value.trim());
        keyData[k] = el.value.trim();
        saved++;
      }
    });
    if (saved > 0) {
      // Also save to Firestore if available
      if (FirebaseBackend.initialized) {
        await FirebaseBackend.saveApiKeys(keyData);
      } else {
        Components.showToast(saved + '個のAPIキーを保存しました（ローカル）', 'success');
      }
      this.loadApiKeyFields();
    } else {
      Components.showToast('保存するAPIキーがありません', 'error');
    }
  }

  async testApiKey() {
    const result = document.getElementById('api-test-result');
    if (result) result.innerHTML = Components.loading('接続テスト中...');

    const model = store.get('selectedModel') || 'claude-sonnet-4-6';
    const apiKey = aiEngine.getApiKey(model);

    if (!apiKey) {
      if (result) result.innerHTML = '<div style="color:var(--danger);font-size:12px">APIキーが設定されていません。上のフィールドにキーを入力して「保存」してください。</div>';
      return;
    }

    try {
      const response = await aiEngine.callModel(model, 'こんにちは。接続テストです。「接続成功」と返答してください。', { maxTokens: 100 });
      if (result) result.innerHTML = `<div style="color:var(--success);font-size:12px;padding:8px;background:var(--success-bg);border-radius:var(--radius-sm)">接続成功（${model}）: ${typeof response === 'string' ? response.substring(0, 100) : 'OK'}</div>`;
    } catch (err) {
      if (result) result.innerHTML = `<div style="color:var(--danger);font-size:12px;padding:8px;background:var(--danger-bg);border-radius:var(--radius-sm)">接続失敗: ${err.message}</div>`;
    }
  }

  async clearApiKeys() {
    ['anthropic', 'openai', 'google'].forEach(k => {
      localStorage.removeItem('apikey_' + k);
      const el = document.getElementById('input-apikey-' + k);
      if (el) el.value = '';
    });
    if (FirebaseBackend.initialized) {
      await FirebaseBackend.saveApiKeys({});
    }
    Components.showToast('すべてのAPIキーを削除しました', 'info');
    this.loadApiKeyFields();
  }

  // ---- Auth ----
  async loginWithGoogle() {
    if (FirebaseBackend.initialized) {
      // Real Google OAuth via Firebase
      try {
        await FirebaseBackend.signInWithGoogle();
        // Navigation handled by onAuthStateChanged
      } catch (err) {
        // Fallback to prompt mode
        this.loginWithPrompt();
      }
    } else {
      this.loginWithPrompt();
    }
  }

  loginWithPrompt() {
    const email = prompt('Googleアカウントのメールアドレスを入力してください:', 'agewaller@gmail.com');
    if (!email) return;
    const user = {
      uid: 'local_' + email.replace(/[^a-z0-9]/gi, '_'),
      displayName: email.split('@')[0],
      email: email,
      photoURL: null
    };
    store.update({ user, isAuthenticated: true });
    this.finishLogin(email);
  }

  finishLogin(email) {
    // Save custom disease name if selected
    const customInput = document.getElementById('custom-disease-name');
    if (customInput && customInput.value.trim()) {
      const diseases = store.get('selectedDiseases') || [];
      if (!diseases.includes('custom')) diseases.push('custom');
      store.set('selectedDiseases', diseases);
      store.set('customDiseaseName', customInput.value.trim());
    }

    // Ensure primary disease is set
    const diseases = store.get('selectedDiseases') || [];
    if (diseases.length > 0 && !store.get('selectedDisease')) {
      for (const cat of CONFIG.DISEASE_CATEGORIES) {
        const found = cat.diseases.find(d => d.id === diseases[0]);
        if (found) {
          store.set('selectedDisease', { id: found.id, name: found.name, fullName: found.name, icon: cat.icon, color: '#6C63FF' });
          break;
        }
      }
    }

    // Default to ME/CFS if nothing selected
    if (!store.get('selectedDisease')) {
      store.set('selectedDisease', { id: 'mecfs', name: 'ME/CFS', fullName: '筋痛性脳脊髄炎/慢性疲労症候群', icon: '🧠', color: '#6C63FF' });
    }

    // Load default prompts
    if (!store.get('customPrompts') || Object.keys(store.get('customPrompts')).length === 0) {
      store.set('customPrompts', { ...DEFAULT_PROMPTS });
    }

    Components.showToast(`${email} でログインしました（${diseases.length}疾患選択）`, 'success');
    this.navigate('dashboard');
  }

  async loginWithEmail(e) {
    if (e) e.preventDefault();
    const form = e.target;
    const email = form.querySelector('[name=email]').value;
    const pass = form.querySelector('[name=password]').value;
    if (!email || !pass) { Components.showToast('メールとパスワードを入力してください', 'error'); return; }

    if (FirebaseBackend.initialized) {
      try {
        await FirebaseBackend.signInWithEmail(email, pass);
      } catch (err) { /* error shown in signInWithEmail */ }
    } else {
      const user = { uid: 'local_' + Date.now(), displayName: email.split('@')[0], email, photoURL: null };
      store.update({ user, isAuthenticated: true });
      Components.showToast('ログインしました（ローカルモード）', 'success');
      this.navigate('disease-select');
    }
  }

  async logout() {
    if (FirebaseBackend.initialized) {
      await FirebaseBackend.signOut();
    } else {
      store.update({ user: null, isAuthenticated: false, currentPage: 'login' });
    }
    this.navigate('login');
  }

  // ---- Disease Selection ----
  // ---- Disease Selection (multi-select) ----
  toggleDiseaseSelection(checkbox) {
    const selected = store.get('selectedDiseases') || [];
    const id = checkbox.value;

    if (checkbox.checked) {
      if (!selected.includes(id)) selected.push(id);
    } else {
      const idx = selected.indexOf(id);
      if (idx >= 0) selected.splice(idx, 1);
    }

    store.set('selectedDiseases', selected);

    // Update count badge
    const countEl = document.getElementById('disease-count');
    if (countEl) countEl.textContent = selected.length + '件選択中';

    // Show/hide custom input
    if (id === 'custom') {
      const customInput = document.getElementById('custom-disease-name');
      if (customInput) customInput.style.display = checkbox.checked ? 'block' : 'none';
    }

    // Also set primary disease for backward compat
    if (selected.length > 0) {
      const primaryId = selected[0];
      // Find disease name from categories
      let primaryDisease = null;
      for (const cat of CONFIG.DISEASE_CATEGORIES) {
        const found = cat.diseases.find(d => d.id === primaryId);
        if (found) {
          primaryDisease = { id: found.id, name: found.name, fullName: found.name, icon: cat.icon, color: '#6C63FF' };
          break;
        }
      }
      if (primaryDisease) store.set('selectedDisease', primaryDisease);
    }
  }

  selectDisease(diseaseId) {
    // Legacy single-select support
    const disease = CONFIG.DISEASES.find(d => d.id === diseaseId);
    if (disease) {
      store.set('selectedDisease', disease);
      store.set('selectedDiseases', [diseaseId]);
      if (!store.get('customPrompts') || Object.keys(store.get('customPrompts')).length === 0) {
        store.set('customPrompts', { ...DEFAULT_PROMPTS });
      }
      Components.showToast(`${disease.name} を選択しました`, 'success');
      this.navigate('dashboard');
    }
  }

  // ---- Data Input ----
  openDataInput(category) {
    const overlay = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');
    const title = document.getElementById('modal-title');
    if (!overlay || !body) return;

    const cat = CONFIG.DATA_CATEGORIES.find(c => c.id === category);
    title.textContent = cat ? `${cat.icon} ${cat.name}を記録` : 'データ入力';

    if (category === 'photos') {
      body.innerHTML = Components.photoUpload(category);
    } else {
      body.innerHTML = Components.dataEntryForm(category);
    }
    overlay.classList.add('active');
  }

  closeModal() {
    document.getElementById('modal-overlay')?.classList.remove('active');
  }

  submitDataForm(e, category) {
    e.preventDefault();
    const form = e.target;
    const data = {};
    new FormData(form).forEach((val, key) => {
      data[key] = isNaN(val) ? val : Number(val);
    });
    // Handle checkboxes
    form.querySelectorAll('input[type=checkbox]').forEach(cb => {
      data[cb.name] = cb.checked;
    });

    store.addHealthData(category, data);
    store.calculateHealthScore();
    Components.showToast('データを保存しました', 'success');
    this.closeModal();
    if (this.currentPage === 'dashboard') this.navigate('dashboard');
  }

  handlePhotoUpload(e, category) {
    const files = e.target.files;
    if (files.length > 0) this.previewFiles(files, category);
  }

  handlePhotoDrop(e, category) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) this.previewFiles(files, category);
  }

  // Store pending files for preview before save
  _pendingFiles = [];

  previewFiles(files, category) {
    const preview = document.getElementById(`photo-preview-${category}`);
    if (!preview) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const fileData = {
          file: file,
          filename: file.name,
          type: file.type,
          size: file.size,
          dataUrl: ev.target.result,
          category: category
        };
        this._pendingFiles.push(fileData);

        // Show preview
        const isImage = file.type.startsWith('image/');
        preview.innerHTML += `
          <div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;background:var(--bg-tertiary)">
            ${isImage
              ? `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover">`
              : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px">📄</div>`}
            <div style="position:absolute;bottom:0;left:0;right:0;padding:4px 6px;background:rgba(0,0,0,0.7);font-size:10px;color:#fff">${file.name} (${(file.size/1024).toFixed(0)}KB)</div>
          </div>`;

        // Show/update save button
        this.showFileSaveButton(category);
      };
      reader.readAsDataURL(file);
    });
  }

  showFileSaveButton(category) {
    let btnArea = document.getElementById('file-save-area');
    if (!btnArea) {
      const preview = document.getElementById(`photo-preview-${category}`);
      if (!preview) return;
      btnArea = document.createElement('div');
      btnArea.id = 'file-save-area';
      btnArea.style.cssText = 'margin-top:16px;display:flex;gap:10px;align-items:center';
      preview.parentElement.appendChild(btnArea);
    }
    btnArea.innerHTML = `
      <button class="btn btn-primary" onclick="app.saveUploadedFiles()">
        ${this._pendingFiles.length}件を保存してAI分析
      </button>
      <button class="btn btn-secondary" onclick="app.clearPendingFiles('${category}')">クリア</button>
      <span style="font-size:12px;color:var(--text-muted)">${this._pendingFiles.length}件のファイル待機中</span>
    `;
  }

  clearPendingFiles(category) {
    this._pendingFiles = [];
    const preview = document.getElementById(`photo-preview-${category}`);
    if (preview) preview.innerHTML = '';
    const btnArea = document.getElementById('file-save-area');
    if (btnArea) btnArea.remove();
  }

  async saveUploadedFiles() {
    if (this._pendingFiles.length === 0) {
      Components.showToast('保存するファイルがありません', 'error');
      return;
    }

    const btnArea = document.getElementById('file-save-area');
    if (btnArea) btnArea.innerHTML = Components.loading('保存＆分析中...');

    const savedEntries = [];
    const textForAnalysis = [];

    for (const fileData of this._pendingFiles) {
      // Try auto-import (XML, CSV, JSON, TXT)
      if (!fileData.type.startsWith('image/')) {
        try {
          const count = await Integrations.importFile(fileData.file);
          if (count > 0) {
            textForAnalysis.push(`[ファイル取込] ${fileData.filename}: ${count}件のデータ`);
            continue;
          }
        } catch (e) { /* fall through to generic save */ }
      }

      // Save image/generic file as health data
      const entry = store.addHealthData('photos', {
        filename: fileData.filename,
        type: fileData.type,
        size: fileData.size,
        dataUrl: fileData.type.startsWith('image/') ? fileData.dataUrl : fileData.dataUrl.substring(0, 200) + '...',
        category: fileData.category
      });
      savedEntries.push(entry);

      // For images, add to AI context
      if (fileData.type.startsWith('image/')) {
        textForAnalysis.push(`[写真アップロード] ${fileData.filename} (${fileData.category}): ${fileData.type}, ${(fileData.size/1024).toFixed(0)}KB`);
      }
    }

    // Save to conversation history for AI context
    if (textForAnalysis.length > 0) {
      const history = store.get('conversationHistory') || [];
      history.push({
        role: 'user',
        content: textForAnalysis.join('\n'),
        timestamp: new Date().toISOString(),
        type: 'file_upload'
      });
      store.set('conversationHistory', history);
    }

    // Sync to Firestore
    if (FirebaseBackend.initialized) {
      for (const entry of savedEntries) {
        await FirebaseBackend.saveHealthEntry('photos', entry);
      }
    }

    const totalCount = this._pendingFiles.length;
    this._pendingFiles = [];

    Components.showToast(`${totalCount}件のファイルを保存しました`, 'success');

    // Re-render and run AI analysis for uploaded content
    if (this.currentPage === 'dashboard') this.navigate('dashboard');
    else if (this.currentPage === 'data-input') this.navigate('data-input');

    const adviceText = textForAnalysis.join('\n');
    if (adviceText) {
      const feedbackEl = document.getElementById('dash-ai-feedback');
      this.showFeedbackLoading(feedbackEl, 'アップロードデータを分析中...');
      this.runBackgroundAnalysis(adviceText, feedbackEl);
    }
  }

  showFileAnalysisResult(container, uploadSummary) {
    container.innerHTML = Components.loading('分析中...');

    setTimeout(() => {
      const advice = this.generateFileAdvice(uploadSummary);
      container.innerHTML = `
        <div class="card" style="border-color:var(--accent-border);margin-top:12px">
          <div class="card-header" style="background:var(--accent-bg)">
            <span class="card-title">アップロードデータの分析結果</span>
          </div>
          <div class="card-body">
            ${advice.alerts.map(a => `
              <div style="padding:10px 14px;background:${a.level === 'warning' ? 'var(--warning-bg)' : 'var(--info-bg)'};border-left:3px solid ${a.level === 'warning' ? 'var(--warning)' : 'var(--info)'};border-radius:0 8px 8px 0;margin-bottom:10px;font-size:13px">${a.message}</div>
            `).join('')}
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;white-space:pre-wrap">${advice.text}</div>
          </div>
        </div>`;
    }, 300);
  }

  generateFileAdvice(summary) {
    const lower = summary.toLowerCase();
    const alerts = [];
    let text = '';

    if (/血液検査|blood|検査結果/.test(lower)) {
      alerts.push({ level: 'info', message: '血液検査データを検出しました。分析ページで詳細な分析を実行できます。' });
      text += '【血液検査データ】アップロードされた検査結果をAI分析に使用します。管理パネルでAPIキーを設定すると、数値の解釈と推奨アクションが自動生成されます。\n\n';
    }

    if (/食事|meal|料理|ごはん|ランチ|ディナー/.test(lower)) {
      text += '【食事写真】食事内容を自動分析し、栄養バランスや抗炎症食の観点からアドバイスを生成します。\n\n';
    }

    if (/処方|薬|prescription|お薬手帳/.test(lower)) {
      alerts.push({ level: 'warning', message: '処方関連データを検出。薬の飲み合わせ確認のためAI分析を実行してください。' });
      text += '【処方データ】処方内容をAIが読み取り、飲み合わせや副作用リスクを確認します。\n\n';
    }

    if (/遺伝子|genetic|dna|snp/.test(lower)) {
      text += '【遺伝子データ】SNPデータや遺伝子検査結果は、薬剤代謝や疾患リスクの個別化分析に使用されます。\n\n';
    }

    if (/csv|json|xml/.test(lower)) {
      text += '【構造化データ】ファイルを自動解析し、適切なカテゴリに分類して保存しました。\n\n';
    }

    if (text === '') {
      text = 'ファイルを保存しました。このデータはAI分析のコンテキストに追加され、次回の分析で反映されます。より詳細な分析にはAI分析ページから分析を実行してください。';
    }

    text += '\n→ 分析ページで「ME/CFS 日次分析」を実行すると、すべてのアップロードデータを含めた総合分析が行えます。';

    return { alerts, text };
  }

  // ---- Text Entry ----
  updateInputHint(category) {
    const hints = {
      symptoms: '例：今朝は倦怠感が強い、頭痛がする、ブレインフォグで集中できない\n📎 体温計やパルスオキシメーターの画面写真もOK',
      mental: '例：気分が落ち込む、不安が強い、孤独感、イライラ、やる気が出ない\n気分を1-10で数値化すると経過追跡しやすくなります',
      sleep: '例：23時就寝→7時起床、中途覚醒2回、夢を見た、寝起きのだるさ\n📎 Fitbit/Oura等の睡眠画面のスクリーンショットもOK',
      pain: '例：右肩の鈍痛 強度6/10、14時から、天気が曇り\n部位・強度・時間帯・トリガーを書くとパターンが見えてきます',
      blood_test: '例：CRP 0.8, WBC 5200, Hb 12.5, TSH 3.2, フェリチン 25\n📎 検査結果の写真をアップロードすると自動で数値を読み取ります',
      medication: '例：ツートラム100mg×2回/日、リンデロン0.5mg朝1回、五苓散2.5g×3回\n📎 お薬手帳や処方箋の写真をアップロードできます',
      supplement: '例：CoQ10 200mg朝食後、マグネシウム400mg就寝前、NMN 250mg空腹時\n効果の実感や副作用も記録してください',
      doctor: '例：山村先生：アザルフィジン追加、次回4週後に血液検査\n📎 紹介状や診断書の写真もアップロードできます',
      allergy: '例：IgE検査でダニ・ハウスダスト陽性、IgG検査で小麦・乳製品に反応\n📎 アレルギー検査結果の写真をアップロード',
      hormone: '例：コルチゾール朝8時: 12μg/dL、DHEA-S: 150μg/dL、エストラジオール: 25pg/mL\n📎 ホルモン検査結果の写真をアップロード',
      genetic: '例：MTHFR C677T ヘテロ、CYP2D6 Poor Metabolizer、COMT Val/Met\n📎 遺伝子検査レポートのスクリーンショットもOK',
      nutrition: '例：朝:オートミール+バナナ+プロテイン、昼:サバ定食、夜:鍋\n📎 食事の写真を撮ってアップロードするとカロリー・栄養素を自動推定',
      water: '例：今日の水分摂取 - 朝500ml、昼300ml、夕500ml、合計1.3L\nPOTS/ME/CFS患者は2-3L/日+塩分が推奨です',
      alcohol: '例：ビール350ml×1本、夕食と一緒に\n薬との相互作用や睡眠への影響を分析します',
      vitals: '例：心拍65bpm、血圧120/78、SpO2 98%、HRV 35ms\n📎 血圧計やパルスオキシメーターの画面写真もOK',
      weight: '例：体重65.2kg、体脂肪率22%、筋肉量48kg\n📎 体組成計（TANITA等）の画面写真もOK',
      activity: '例：散歩15分、ヨガ20分、家事30分、合計活動1時間\n翌日のPEM有無も忘れず記録してください',
      menstrual: '例：生理2日目、経血量多い、下腹部痛あり、PMS症状5日前から\n基礎体温も記録すると排卵日予測ができます',
      weather: '例：気圧1005hPa→998hPaに低下、曇り→雨、頭痛発症\n📎 気圧アプリのスクリーンショットもOK',
      environment: '例：室温24°C、湿度45%、エアコン使用、窓を開けて換気\nスマホの寝室持ち込みの有無も体調に影響します',
      conversation: '例：山村先生との診察で免疫抑制剤の追加を検討、友人と電話30分\n📎 Plaudの文字起こしをペースト or 連携ページから取り込み',
      work: '例：ミーティング2件（合計2時間）、資料作成1時間、午後にPEM症状\n50分作業→10分休憩のリズムを守りましょう',
      family: '例：母と電話30分（元気をもらった）、一人で夕食（孤独感）\n社会的つながりは回復の重要な要素です',
      travel: '例：東京→秦野 電車1.5時間、帰宅後強い倦怠感\n移動後は1-2日の回復期間を確保してください',
      finance: '例：今月の医療費合計3万円、サプリ代1.5万円\n高額療養費制度や難病助成制度の対象になる場合があります',
      meditation: '例：朝10分の坐禅、4-7-8呼吸法×3セット、ボディスキャン瞑想\n継続日数と体調の相関を追跡しています',
      research: '例：LDNのME/CFS効果の論文を読んだ、PubMed PMID: 12345678\n気になった治療法や論文の情報を記録してください',
      other: '何でも自由に記録してください。内容を自動で分類・分析します。'
    };
    const hint = hints[category] || hints.other;
    const hintEl = document.getElementById('input-hint');
    if (hintEl) hintEl.innerHTML = '💡 ' + hint.replace(/\n/g, '<br>');

    // Update placeholder
    const textarea = document.getElementById('text-input-content');
    if (textarea) textarea.placeholder = hint.split('\n')[0].replace('例：', '');
  }

  submitTextEntry() {
    const category = document.getElementById('text-input-category')?.value || 'other';
    const title = document.getElementById('text-input-title')?.value?.trim() || '';
    const content = document.getElementById('text-input-content')?.value?.trim() || '';
    const dateStr = document.getElementById('text-input-date')?.value || '';

    if (!content) {
      Components.showToast('内容を入力してください', 'error');
      return;
    }

    const timestamp = dateStr ? new Date(dateStr + 'T12:00:00').toISOString() : new Date().toISOString();

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      timestamp: timestamp,
      category: category,
      type: 'text_entry',
      title: title,
      content: content
    };

    // Store in conversation history for AI context
    const history = store.get('conversationHistory') || [];
    history.push({
      role: 'user',
      content: `[${category}] ${title ? title + ': ' : ''}${content}`,
      timestamp: entry.timestamp,
      type: 'data_entry'
    });
    store.set('conversationHistory', history);

    // Always store in textEntries for AI analysis
    const textEntries = store.get('textEntries') || [];
    textEntries.push(entry);
    store.set('textEntries', textEntries);

    // Also store as health data in the appropriate category
    const stateKey = store.categoryToStateKey(category);
    if (stateKey && Array.isArray(store.get(stateKey))) {
      store.addHealthData(category, { text_note: content, title: title });
    }

    // Clear form
    document.getElementById('text-input-content').value = '';
    document.getElementById('text-input-title').value = '';

    // Navigate to dashboard and run AI analysis
    this.navigate('dashboard');
    Components.showToast('保存しました', 'success');

    const feedbackEl = document.getElementById('dash-ai-feedback');
    this.showFeedbackLoading(feedbackEl, '入力内容を分析中...');
    this.runBackgroundAnalysis(content, feedbackEl);
  }

  showInstantAdvice(newText, category) {
    const adviceArea = document.getElementById('instant-advice');
    if (!adviceArea) return;

    adviceArea.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">🤖 アドバイス</span>
          <div class="spinner" style="width:18px;height:18px;border-width:2px"></div>
        </div>
        <div class="card-body" style="color:var(--text-muted);font-size:13px">入力内容を分析しています...</div>
      </div>`;

    // Run AI analysis asynchronously
    this.runBackgroundAnalysis(newText, adviceArea).then(() => {
      const status = document.getElementById('text-save-status');
      if (status) status.textContent = 'AI分析完了';
    });
  }

  // [REMOVED] generateInstantAdvice - replaced by AI API calls via QUICK_ANALYSIS_PROMPT
  _legacy_generateInstantAdvice(text, category) {
    const lower = text.toLowerCase();
    const alerts = [];
    const actions = [];
    let advice = '';

    // PEM detection
    if (/pem|労作後|倦怠感がひどい|動けな[いく]|まったく動け|寝込/.test(lower)) {
      alerts.push({ level: 'warning', message: 'PEM（労作後倦怠感）の兆候を検出しました。今日は活動を最小限に抑えてください。' });
      advice += '【PEM管理】安静を最優先してください。横になり、刺激（スマホ・TV）を減らし、心拍数が安静時+20bpm以内に保たれるようにしてください。\n\n';
      actions.push('活動を即座に中断し、安静にする');
      actions.push('次の24-48時間は回復に充てる');
    }

    // Headache (specific)
    if (/頭痛|偏頭痛|片頭痛|頭が痛|頭が重|ズキズキ/.test(lower)) {
      alerts.push({ level: 'info', message: '頭痛の記録を検出。頻度・部位・トリガーを追跡すると予防策が見えてきます。' });
      advice += '【頭痛管理】\n・片頭痛の場合：暗い静かな部屋で休む、こめかみを冷やす\n・緊張型頭痛の場合：首・肩のストレッチ、温める\n・マグネシウム（400mg/日）は片頭痛予防のエビデンスあり\n・気圧変動が原因の場合は五苓散の予防服用を\n・頻回（月10日以上）の場合は神経内科受診を推奨\n\n';
      advice += '記録のコツ：頭痛の部位（前頭/側頭/後頭）、持続時間、吐き気の有無、トリガー（天気/食事/ストレス/睡眠不足/生理周期）も書くとパターンが見えてきます。\n\n';
      actions.push('頭痛の部位・強度・トリガーを記録する');
    }

    // Pain (general)
    if (/疼痛|痛[いみむ]|痛む|ぴきぴき|バキバキ|関節|筋肉痛|腰痛|肩こり/.test(lower) && !/頭痛|偏頭痛/.test(lower)) {
      alerts.push({ level: 'info', message: '疼痛の記録を検出。痛みの部位・強度・時間帯を追跡することで傾向が見えてきます。' });
      advice += '【疼痛管理】\n・痛み止めは食事と一緒に服用\n・エプソムソルト入浴（38°C, 20分）で筋緊張を緩和\n・マグネシウムバーム外用も局所疼痛に有効\n・痛みが2週間以上続く場合は専門医受診を\n\n';
      actions.push('痛みの部位と強度を記録する');
    }

    // Menstruation / hormonal
    if (/生理|月経|PMS|排卵|更年期|ホルモン|おりもの|子宮|卵巣|月のもの|整理|レディース/.test(lower)) {
      alerts.push({ level: 'info', message: '月経・ホルモン関連の記録を検出。周期と体調の相関を追跡しています。' });
      advice += '【月経・ホルモン管理】\n';
      if (/pms|生理前|月経前/.test(lower)) {
        advice += '・PMS症状にはマグネシウム（300-400mg/日）、ビタミンB6（50mg/日）、月見草オイルが有効\n';
        advice += '・カフェイン・塩分・精製糖を控えると症状が軽減する場合あり\n';
      }
      if (/痛|つらい|辛い|重い|だるい/.test(lower)) {
        advice += '・月経痛には温める（腹部にカイロ）、軽いストレッチ、鎮痛剤は早めに服用\n';
        advice += '・痛みがひどい場合は子宮内膜症の可能性も。婦人科受診を検討\n';
      }
      if (/更年期|ホットフラッシュ|のぼせ/.test(lower)) {
        advice += '・更年期症状にはエクオール（大豆イソフラボン代謝物）のサプリメントが有効な場合あり\n';
        advice += '・漢方（加味逍遙散、当帰芍薬散等）も選択肢。婦人科で相談を\n';
      }
      advice += '・基礎体温や月経周期の記録を続けると、体調パターンが明確になります\n\n';
      actions.push('月経周期と体調の関連を記録する');
    }

    // Digestive symptoms
    if (/お腹|腹痛|下痢|便秘|吐き気|嘔吐|胃|膨満|ガス|消化|食欲不振|胃もたれ/.test(lower)) {
      advice += '【消化器症状】\n';
      if (/下痢/.test(lower)) advice += '・水分補給を十分に（経口補水液推奨）\n・BRAT食（バナナ・米・りんご・トースト）で消化器を休める\n';
      if (/便秘/.test(lower)) advice += '・水溶性食物繊維（サイリウムハスク等）を増やす\n・水分を1日1.5L以上\n・適度な運動と腹部マッサージ\n';
      if (/吐き気|嘔吐|気持ち悪/.test(lower)) advice += '・生姜（ジンジャーティー）が制吐作用あり\n・少量ずつ頻回に水分を摂る\n';
      if (/胃もたれ|膨満|ガス/.test(lower)) advice += '・食事はゆっくり噛んで食べる\n・発酵食品（ヨーグルト・味噌）で腸内環境改善\n';
      advice += '・症状が2週間以上続く場合は消化器内科受診を\n\n';
      actions.push('食事内容と消化器症状の関連を記録する');
    }

    // Dizziness / vertigo
    if (/めまい|立ちくらみ|ふらつき|回転|耳鳴り|目眩/.test(lower)) {
      alerts.push({ level: 'warning', message: 'めまいの記録を検出。転倒に注意してください。頻回の場合は耳鼻科・神経内科の受診を。' });
      advice += '【めまい管理】\n・急な立ち上がりを避ける（座位→立位はゆっくり）\n・水分と塩分を十分に摂取（POTS/起立性低血圧対策）\n・横になれる場所を確保してから活動\n・めまいの種類（回転性/浮動性/立ちくらみ）を記録すると診断の助けに\n\n';
      actions.push('めまいの種類と発生状況を記録する');
    }

    // Skin symptoms
    if (/肌荒れ|かゆ[いみ]|湿疹|蕁麻疹|アトピー|乾燥|肌|ニキビ|発疹/.test(lower)) {
      advice += '【皮膚症状】\n・保湿を基本に（セラミド配合のクリーム推奨）\n・かゆみには冷やすことが即効性あり\n・食事アレルギーや腸内環境との関連も検討\n・IgG食物アレルギー検査で隠れた原因がわかる場合も\n\n';
      actions.push('皮膚症状と食事・ストレスの関連を記録する');
    }

    // Breathing / respiratory
    if (/息苦し|呼吸|咳|喘息|胸[がの]|息が|喉[がの]詰|過呼吸/.test(lower)) {
      if (/過呼吸|パニック/.test(lower)) {
        alerts.push({ level: 'warning', message: '過呼吸・パニックの兆候。紙袋呼吸は推奨されません。ゆっくり腹式呼吸（4秒吸う→6秒吐く）を。' });
      }
      advice += '【呼吸器症状】\n・腹式呼吸の練習（横隔膜を意識して）\n・姿勢を正す（猫背は呼吸を浅くする）\n・室内の湿度50-60%を維持\n・症状が続く場合は呼吸器内科受診を\n\n';
    }

    // Fatigue (standalone, not PEM)
    if (/だるい|だるさ|倦怠|疲れ[がた]|疲労|しんどい|エネルギーが/.test(lower) && !/pem|労作後/.test(lower)) {
      advice += '【疲労管理】\n・まず水分補給と軽い栄養補給を\n・鉄分・ビタミンB12・甲状腺機能の検査を推奨\n・慢性的な場合はCFS/ME、副腎疲労、甲状腺機能低下を疑い検査を\n・今できること：横になる、深呼吸5回、ミント or 柑橘系のアロマ\n\n';
      actions.push('疲労の程度と可能な原因を記録する');
    }

    // Mental health
    if (/鬱|孤独|不安|辛[いか]|死|自殺|ネガティ|絶望|メンタル|イライラ|焦燥/.test(lower)) {
      alerts.push({ level: 'danger', message: '精神面の不調を検出しました。信頼できる方への連絡、または専門家への相談を推奨します。' });
      advice += '【メンタルケア】孤独感やネガティブな感情が記録されています。以下を試してください：\n・信頼できる人に電話する（短時間でもOK）\n・呼吸法：4秒吸って→7秒止めて→8秒吐く を3セット\n・「今あるもの」への感謝リストを3つ書く\n・無理に活動せず、副交感神経優位な環境を作る\n\n';
      actions.push('信頼できる人に連絡する');
      actions.push('4-7-8呼吸法を3セット実施');
    }

    // Medication notes
    if (/ツートラム|リンデロン|エチゾラム|ステロイド|プレドニゾ|カロナール|リボトリール|減薬/.test(lower)) {
      advice += '【服薬メモ】薬の変更や減薬に関する記録を検出。必ず主治医と相談の上で進めてください。特にベンゾジアゼピン系（エチゾラム・リボトリール）の減薬は10%/月の漸減が推奨されています。\n\n';
      actions.push('次回診察時にお薬手帳を更新');
    }

    // Supplements
    if (/coq10|コエンザイム|nmn|クレアチン|オメガ3|ビタミン|マグネシウム|サプリ|5-ala|カルニチン/.test(lower)) {
      advice += '【サプリメント】言及されたサプリメントについて：飲み合わせの安全性を確認してください。CoQ10は食事と一緒に、マグネシウムは就寝前に、NMNは朝の空腹時がベストです。\n\n';
    }

    // Bath / Epsom salt
    if (/エプソムソルト|風呂|入浴/.test(lower)) {
      advice += '【入浴療法】エプソムソルト入浴の効果を記録されています。継続してください。推奨：38-39°C、15-20分、就寝90分前。マグネシウム経皮吸収により筋弛緩・自律神経調整効果が期待できます。\n\n';
    }

    // Weather sensitivity
    if (/気圧|天候|気象病|五苓散/.test(lower)) {
      advice += '【気象病対策】気圧変動への感受性が記録されています。「頭痛ーる」アプリで翌日の気圧を確認し、低気圧接近の6時間前に五苓散2.5gを予防服用してください。\n\n';
      actions.push('気圧予報を確認する');
    }

    // Meditation / breathing
    if (/瞑想|呼吸法|マインドフル|ムドラー|坐禅/.test(lower)) {
      advice += '【瞑想・呼吸法】効果を感じている記録があります。迷走神経トーニング効果により自律神経バランスが改善されます。朝10分＋就寝前10分を目標に継続してください。\n\n';
    }

    // Activity / exercise
    if (/ジム|運動|散歩|ストレッチ|ヨガ|自転車|ランニング/.test(lower)) {
      advice += '【活動管理】運動記録を検出。ME/CFS患者は活動後のPEMに注意が必要です。心拍数が安静時+30bpmを超えない範囲で活動し、翌日の体調を必ず確認してください。\n\n';
      actions.push('活動後24-48時間の体調をモニタリング');
    }

    // Sleep
    if (/眠[れり]|寝[たて]|睡眠|不眠|マイスリー|ゾルピデム|起き[たれ]/.test(lower)) {
      advice += '【睡眠管理】睡眠に関する記録あり。睡眠衛生チェック：①スマホは寝室に持ち込まない ②室温21-23°C ③就寝1時間前はスクリーンOFF ④一定の起床時間を保つ\n\n';
    }

    // Doctor visits
    if (/先生|クリニック|病院|診察|受診/.test(lower)) {
      advice += '【診察メモ】医療機関の受診記録です。次回の診察に向けて、このテキストをプリントして主治医に共有することを推奨します。\n\n';
      actions.push('診察メモをまとめて主治医に共有する');
    }

    // GLP-1
    if (/リベルサス|glp-1|セマグルチド/.test(lower)) {
      alerts.push({ level: 'info', message: 'GLP-1受容体作動薬の使用を検出。消化器系副作用（吐き気）に注意し、医師の管理下での使用を推奨します。' });
      advice += '【GLP-1薬】リベルサスは空腹時に少量の水で服用し、30分後に食事。吐き気がある場合は用量調整を検討してください。\n\n';
    }

    // Always provide meaningful feedback - never empty
    if (advice === '') {
      // Analyze text properties for general feedback
      const wordCount = text.split(/\s+/).length;
      const hour = new Date().getHours();
      const isPositive = /良[いか]|楽|嬉し|ありがた|できた|回復|改善|元気|快適|調子が良/.test(lower);
      const isNegative = /悪[いか]|辛|つら|しんど|きつ|ダメ|無理|厳し|最悪|絶望/.test(lower);
      const mentionsFood = /食[べ事]|ご飯|ランチ|ディナー|朝食|昼食|夕食|料理|カフェ|レストラン/.test(lower);
      const mentionsExercise2 = /歩[いく]|走|筋トレ|体操|泳|登|スポーツ/.test(lower);
      const mentionsPeople = /友人|友達|家族|彼女|彼氏|先生|会議|ミーティング|電話|会[っ話]/.test(lower);
      const mentionsWork = /仕事|作業|プロジェクト|ミーティング|締切|タスク/.test(lower);

      if (isPositive) {
        alerts.push({ level: 'info', message: '良い傾向が記録されました。何が効果的だったか振り返ると、今後の参考になります。' });
        advice += '【ポジティブな記録】体調の良い日の記録はとても貴重です。このパターンを分析することで、何があなたの体調を改善するかが見えてきます。\n\n';
        advice += '振り返りのポイント：\n・昨日の睡眠時間と質はどうでしたか？\n・食事内容で特別なものはありましたか？\n・ストレスレベルは低かったですか？\n・天気や気圧は安定していましたか？\n\n';
        actions.push('良い日の条件を振り返ってメモする');
      } else if (isNegative) {
        alerts.push({ level: 'warning', message: '体調の不調を検出しました。無理をせず休息を優先してください。' });
        advice += '【体調不良の記録】辛い時の記録も大切です。パターンを分析することで予防策が見えてきます。\n\n';
        advice += '今すぐできること：\n・活動を最小限に抑える\n・水分をしっかり取る\n・深呼吸を5回行う\n・楽な姿勢で横になる\n\n';
        actions.push('今日は無理をせず休息する');
        actions.push('水分を500ml以上摂取する');
      } else if (mentionsFood) {
        advice += '【食事の記録】食事内容をAIが栄養面から分析します。写真を添付するとより詳細な分析が可能です。\n\n';
        advice += 'ヒント：食事と体調の相関を見つけるために、食後2-3時間の体調も記録してみてください。\n\n';
        actions.push('食後の体調を記録する');
      } else if (mentionsExercise2) {
        advice += '【活動の記録】活動内容を記録しました。ME/CFSなど慢性疲労がある場合は、活動後24-48時間の体調変化を追跡することが重要です。\n\n';
        actions.push('明日の体調を確認して記録する');
      } else if (mentionsPeople) {
        advice += '【社会的交流】人との交流は精神面に大きな影響があります。エネルギー消費も大きいので、交流後の体調も記録してみてください。\n\n';
        actions.push('交流後のエネルギーレベルを記録する');
      } else if (mentionsWork) {
        advice += '【仕事・作業】仕事のストレスと体調は密接に関連します。休憩を定期的に取り、ペーシングを意識してください。\n\n';
        actions.push('50分作業→10分休憩のリズムを守る');
      } else {
        const hour = new Date().getHours();
        if (hour < 10) {
          advice += '【朝の養生】おはようございます。\n\n';
          advice += '朝は「陽の気」が満ちる時間。身体の声に耳を傾けてみてください：\n・起床時の気分は？（穏やか/重い/爽やか）\n・睡眠は足りましたか？\n・身体のこわばりや痛みは？\n・今日はどのくらい動けそうですか？\n\n';
          advice += '養生のヒント：朝一杯の白湯で胃腸を温めることから始めてみましょう。\n\n';
          actions.push('白湯を一杯飲む');
          actions.push('今日のエネルギー予算を決める');
        } else if (hour < 14) {
          advice += '【昼の養生】午前中の振り返りの時間です。\n\n';
          advice += '「間（ま）」を大切に。活動と休息のリズムを意識して、午後に備えましょう。\nエネルギーの残量を感じてみてください。\n\n';
          actions.push('5分間の深呼吸（腹式呼吸）');
        } else if (hour < 19) {
          advice += '【夕の養生】一日の折り返しです。\n\n';
          advice += '夕方は副交感神経が優位になる「陰」の時間帯。\n身体が求める休息を聴いてあげてください。温かいお茶を一杯、ゆっくりと。\n\n';
          actions.push('温かいお茶（緑茶・ほうじ茶）を飲む');
        } else {
          advice += '【夜の養生】今日一日、お疲れさまでした。\n\n';
          advice += '就寝前のふりかえりは養生の基本です。\n今日よかったこと、感謝できることを一つ思い浮かべてみてください。\n\n';
          advice += '養生の夜の習慣：\n・ぬるめの入浴（38-39°C）で一日の疲れを流す\n・スマホを手放し、静かな時間を作る\n・深い呼吸を5回\n\n';
          actions.push('入浴で一日をリセットする');
        }
      }

      advice += '改善（かいぜん）：小さな記録の積み重ねが、大きな変化をもたらします。';
    }

    // Ensure at least one action
    if (actions.length === 0) {
      actions.push('次の体調変化時にも記録する');
    }

    // Add streak/motivation message
    const totalEntries = (store.get('textEntries') || []).length;
    if (totalEntries > 0 && totalEntries % 7 === 0) {
      alerts.unshift({ level: 'info', message: `${totalEntries}件目の記録です！継続は力なり。データが蓄積されるほど分析精度が向上します。` });
    } else if (totalEntries === 1) {
      alerts.unshift({ level: 'info', message: '最初の記録です！毎日続けると、体調パターンが見えてきます。' });
    }

    return { text: advice, alerts, actions };
  }

  // ---- AI Analysis ----
  async runAnalysis(promptKey) {
    const prompts = { ...DEFAULT_PROMPTS, ...(store.get('customPrompts') || {}) };
    const promptConfig = prompts[promptKey] || Object.values(prompts)[0];
    if (!promptConfig) { Components.showToast('プロンプトが見つかりません', 'error'); return; }

    const resultArea = document.getElementById('analysis-result');
    if (resultArea) resultArea.innerHTML = Components.loading('分析を実行中...');

    try {
      const result = await aiEngine.runScheduledAnalysis(promptConfig);
      if (resultArea) this.renderAnalysisResult(result, resultArea);
      Components.showToast('分析が完了しました', 'success');
    } catch (err) {
      if (resultArea) resultArea.innerHTML = `<div style="color:var(--danger);padding:20px">分析エラー: ${err.message}</div>`;
      Components.showToast('分析に失敗しました', 'error');
    }
  }

  // ---- PubMed Live Search ----
  // Generate clinic/workshop/event recommendations via API
  async loadActionRecommendations() {
    const container = document.getElementById('action-live-recs');
    if (!container) return;

    // Check cache (refresh every 12 hours)
    const cached = store.get('cachedActions');
    if (cached && cached.html && (Date.now() - cached.fetchedAt) < 12 * 60 * 60 * 1000) {
      container.innerHTML = cached.html;
      return;
    }

    const apiKey = aiEngine.getApiKey(store.get('selectedModel'));
    if (!apiKey) {
      container.innerHTML = this.generateLocalActionRecs();
      return;
    }

    container.innerHTML = Components.loading('あなたに合った施設・イベントを検索中...');

    const diseases = store.get('selectedDiseases') || [];
    const profile = store.get('userProfile') || {};
    const recentText = (store.get('textEntries') || []).slice(-5).map(e => e.content || '').join('\n').substring(0, 2000);
    const today = new Date();
    const dayOfWeek = ['日','月','火','水','木','金','土'][today.getDay()];
    const randomSeed = Math.floor(today.getTime() / 86400000); // Changes daily

    const prompt = `あなたは慢性疾患患者の生活支援の専門家です。
以下のユーザー情報に基づいて、今日（${today.toLocaleDateString('ja-JP')}・${dayOfWeek}曜日）おすすめのアクションを提案してください。

【重要】毎回異なる視点・新しい選択肢を提示すること。前回と同じ提案は避けてください。
ランダムシード: ${randomSeed}（この数値に基づいて提案内容を変化させてください）

【ユーザー情報】
疾患: ${diseases.join(', ') || '未設定'}
居住地: ${profile.location || '日本・関東'}
言語: ${profile.language || 'ja'}
年齢: ${profile.age || '未設定'}
通院範囲: ${profile.travelRange || '関東圏'}

【重要】居住地の国・地域に応じたイベントプラットフォームと医療検索サービスを使うこと。
日本ならPeatix/病院なび/ストアカ、米国ならEventbrite/Zocdoc/Meetup、
欧州ならDoctolib/Jameda等、その地域で実際に使われているサービスを特定して提案すること。
すべての提案にクリック可能なURLを付けること（検索キーワード入り）。

【最近の記録から推測される状態】
${recentText || '記録なし'}

以下の5カテゴリから各1-2件、合計5-8件を提案してください：

■ 1. クリニック・医療機関（ユーザーの国・地域の医療検索サイトで探す）
・その地域の医療検索サービスで見つかる専門クリニック
・医療機関名、診療科、住所、特徴
・予約URL（その国の予約サイト経由）

■ 2. ワークショップ・セミナー（その地域のイベントプラットフォームで探す）
・その国で使われているイベントサイトの具体的な検索URL
・マインドフルネス、ヨガ、栄養学、運動療法のクラス
・Peatix/Eventbrite/connpass/ストアカで検索するためのキーワード
・具体的な検索URL例を提示

■ 3. 患者会・コミュニティ
・疾患別の患者支援団体、オンラインコミュニティ
・参加方法、費用、次回の集まり
・同じ疾患を持つ人とつながる具体的な方法

■ 4. 今日できるセルフケア
・今日の天気/曜日/季節に合わせた具体的な養生法
・新しい食事法、入浴法、呼吸法、運動法の提案
・初めて試すことを1つ含める

■ 5. 新しい治療・アプローチ
・最近注目されている治療法や臨床試験
・海外で成果が出ている代替療法
・日本で受けられる最新の統合医療

各提案は以下の形式で出力：
【カテゴリ】タイトル
説明（2-3行）
アクション：具体的な次のステップ
URL/連絡先：（あれば）`;

    try {
      const response = await aiEngine.callModel(store.get('selectedModel'), prompt, { maxTokens: 3000 });
      if (typeof response === 'string' && response.length > 100) {
        const html = `<div style="font-size:13px;color:var(--text-primary);line-height:1.8;white-space:pre-wrap">${Components.formatMarkdown(response)}</div>`;
        container.innerHTML = html;
        store.set('cachedActions', { html, fetchedAt: Date.now() });
      } else {
        container.innerHTML = this.generateLocalActionRecs();
      }
    } catch (err) {
      console.warn('[Action Recs] API failed:', err.message);
      container.innerHTML = this.generateLocalActionRecs();
    }
  }

  generateLocalActionRecs() {
    const diseases = store.get('selectedDiseases') || [];
    const profile = store.get('userProfile') || {};
    const location = profile.location || '関東';
    const day = new Date().getDay();
    const tips = [
      '朝日を浴びて体内時計をリセット。15分の散歩から始めてみましょう。',
      '発酵食品（味噌汁、納豆、ぬか漬け）を1品追加して腸内環境を改善。',
      'エプソムソルト入浴（38°C, 20分）で自律神経を整えてみましょう。',
      '4-7-8呼吸法（吸う4秒→止める7秒→吐く8秒）を3セット試してみてください。',
      'デジタルデトックス：今日1時間だけスマホを手放してみましょう。',
      '感謝日記：今日良かったことを3つ書いてみてください。',
      '緑茶やほうじ茶でカフェインを控えめに。L-テアニンでリラックス。',
    ];

    // Detect region from location
    const lang = profile.language || 'ja';
    const loc = (profile.location || '').toLowerCase();
    const isJapan = lang === 'ja' || /日本|tokyo|osaka|神奈川|東京|秦野/.test(loc);
    const isUS = /us|usa|america|new york|california|texas/.test(loc);
    const isUK = /uk|england|london|manchester/.test(loc);
    const isEU = /germany|france|spain|italy|deutschland|paris|berlin/.test(loc);
    const isAU = /australia|sydney|melbourne/.test(loc);
    const isKR = lang === 'ko' || /korea|seoul|부산/.test(loc);

    // Region-specific event platform
    const eventBase = isUS ? 'https://www.eventbrite.com/d/online/' :
      isUK ? 'https://www.eventbrite.co.uk/d/online/' :
      isAU ? 'https://www.eventbrite.com.au/d/online/' :
      isKR ? 'https://www.meetup.com/find/?keywords=' :
      isEU ? 'https://www.eventbrite.com/d/online/' :
      'https://peatix.com/search?q=';

    const clinicBase = isUS ? 'https://www.zocdoc.com/search?dr_specialty=' :
      isUK ? 'https://www.nhs.uk/service-search/find-a-service?q=' :
      isAU ? 'https://www.hotdoc.com.au/search?q=' :
      'https://byoinnavi.jp/search?q=';

    const searchLinks = [];
    // Disease-specific searches
    const diseaseSearchTerms = {
      mecfs: { ja: 'ME/CFS 慢性疲労', en: 'ME CFS chronic fatigue' },
      depression: { ja: 'うつ病 回復', en: 'depression recovery support' },
      fibromyalgia: { ja: '線維筋痛症', en: 'fibromyalgia support' },
      long_covid: { ja: 'Long COVID 後遺症', en: 'long covid support' },
      bipolar: { ja: '双極性障害 当事者会', en: 'bipolar support group' },
      ptsd: { ja: 'PTSD トラウマ', en: 'PTSD trauma support' },
      adhd: { ja: 'ADHD 大人の発達障害', en: 'adult ADHD support' },
    };
    diseases.forEach(d => {
      const terms = diseaseSearchTerms[d];
      if (terms) {
        const q = isJapan ? terms.ja : terms.en;
        searchLinks.push({ label: q, url: eventBase + encodeURIComponent(q) });
      }
    });

    // Common wellness searches
    const wellnessTerms = isJapan
      ? [{ l: 'マインドフルネス', q: 'マインドフルネス ' + location }, { l: 'ヨガ教室', q: 'ヨガ 初心者 ' + location }, { l: '栄養セミナー', q: '栄養 健康 セミナー' }]
      : [{ l: 'Mindfulness', q: 'mindfulness meditation' }, { l: 'Yoga class', q: 'yoga beginner' }, { l: 'Nutrition', q: 'nutrition wellness' }];
    wellnessTerms.forEach(w => searchLinks.push({ label: w.l, url: eventBase + encodeURIComponent(w.q) }));

    // Clinic search
    const clinicTerms = isJapan ? '慢性疲労 専門' : 'chronic fatigue specialist';
    searchLinks.push({ label: isJapan ? '専門クリニックを探す' : 'Find specialist', url: clinicBase + encodeURIComponent(clinicTerms) });

    return `
      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">今日の養生ヒント</div>
        <div style="padding:10px 14px;background:var(--accent-bg);border-radius:var(--radius-sm);font-size:12px;line-height:1.7">${tips[day]}</div>
      </div>
      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">ワークショップ・イベントを探す</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${searchLinks.map(l => `<a href="${l.url}" target="_blank" rel="noopener" class="btn btn-sm btn-outline" style="font-size:11px">${l.label}</a>`).join('')}
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted)">管理者がAPIキーを設定すると、あなたの疾患・地域に特化したクリニックやイベントの提案が自動生成されます。</div>`;
  }

  async loadDashResearch() {
    const container = document.getElementById('dash-research');
    if (!container) return;

    // Check cache: only fetch once per day
    const cached = store.get('cachedResearch');
    const now = Date.now();
    if (cached && cached.articles && (now - cached.fetchedAt) < 24 * 60 * 60 * 1000) {
      this.renderDashResearch(container, cached.articles);
      return;
    }

    container.innerHTML = Components.loading('最新論文を検索中...');

    // Build search query from user's diseases
    const diseases = store.get('selectedDiseases') || [];
    const diseaseTerms = {
      mecfs: 'ME/CFS OR myalgic encephalomyelitis OR chronic fatigue syndrome',
      depression: 'major depressive disorder treatment',
      bipolar: 'bipolar disorder treatment',
      ptsd: 'PTSD treatment',
      adhd: 'ADHD treatment',
      long_covid: 'long COVID OR post-COVID',
      fibromyalgia: 'fibromyalgia treatment',
      hashimoto: 'Hashimoto thyroiditis',
      diabetes_t2: 'type 2 diabetes treatment',
      sle: 'systemic lupus erythematosus',
      ibs: 'irritable bowel syndrome treatment',
      pots: 'postural orthostatic tachycardia',
      insomnia: 'insomnia treatment',
    };
    const terms = diseases.map(d => diseaseTerms[d]).filter(Boolean);
    const query = terms.length > 0 ? `(${terms.join(' OR ')})` : 'chronic disease management';

    try {
      let articles = await aiEngine.searchPubMed(query + ' AND ("last 7 days"[dp])', 5);
      if (articles.length === 0) {
        articles = await aiEngine.searchPubMed(query + ' AND ("last 30 days"[dp])', 5);
      }
      if (articles.length === 0) {
        articles = await aiEngine.searchPubMed(query, 5);
      }
      if (articles.length === 0) {
        container.innerHTML = '<p style="font-size:12px;color:var(--text-muted);padding:10px">該当する最新論文が見つかりませんでした。</p>';
        return;
      }
      // Cache results
      store.set('cachedResearch', { articles, fetchedAt: Date.now() });
      this.renderDashResearch(container, articles);
    } catch (err) {
      container.innerHTML = `<p style="font-size:12px;color:var(--text-muted);padding:10px">論文検索中にエラーが発生しました</p>`;
    }
  }

  renderDashResearch(container, articles) {
    container.innerHTML = articles.map(a => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;line-height:1.4;margin-bottom:4px">${a.title}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">${(a.authors||'').substring(0,60)} — ${a.journal} (${a.date})</div>
        <div style="display:flex;gap:6px">
          <a href="${a.translateUrl || a.url}" target="_blank" rel="noopener" style="font-size:10px;color:var(--accent)">日本語で読む</a>
          <a href="${a.url}" target="_blank" rel="noopener" style="font-size:10px;color:var(--text-muted)">PubMed</a>
        </div>
      </div>
    `).join('') + `<div style="padding:8px 0"><button class="btn btn-outline btn-sm" onclick="app.navigate('research')" style="font-size:11px">もっと見る</button></div>`;
  }

  async searchPubMedLive() {
    const query = document.getElementById('pubmed-search-query')?.value || 'ME/CFS';
    const days = parseInt(document.getElementById('pubmed-search-days')?.value || '30');
    const resultsArea = document.getElementById('pubmed-results');
    if (!resultsArea) return;

    resultsArea.innerHTML = Components.loading('PubMedを検索中...');

    // Add date filter
    const dateFilter = `AND ("last ${days} days"[dp])`;
    const fullQuery = query + dateFilter;

    try {
      const articles = await aiEngine.searchPubMed(fullQuery, 20);

      if (articles.length === 0) {
        resultsArea.innerHTML = Components.emptyState('🔬', '該当する論文が見つかりませんでした', '検索期間を広げるか、キーワードを変更してみてください。');
        return;
      }

      resultsArea.innerHTML = `
        <h3 style="font-size:15px;font-weight:600;margin-bottom:12px">PubMed検索結果（${articles.length}件）</h3>
        ${articles.map(a => `
          <div class="card" style="margin-bottom:12px">
            <div class="card-body" style="padding:16px 20px">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
                <span class="tag tag-info">PMID: ${a.pmid}</span>
                <span style="font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace">${a.date}</span>
              </div>
              <h4 style="font-size:14px;font-weight:600;margin-bottom:6px;line-height:1.5">${a.title}</h4>
              <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${a.authors.substring(0, 100)}${a.authors.length > 100 ? '...' : ''} — ${a.journal}</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <a href="${a.url}" target="_blank" rel="noopener" class="btn btn-sm btn-outline">PubMed（英語）</a>
                <a href="${a.translateUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">日本語で読む</a>
                ${a.doiUrl ? `<a href="${a.doiUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">論文全文（DOI）</a>` : ''}
                ${a.doiTranslateUrl ? `<a href="${a.doiTranslateUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-outline">論文全文（日本語）</a>` : ''}
              </div>
            </div>
          </div>
        `).join('')}`;

      Components.showToast(`${articles.length}件の論文が見つかりました`, 'success');
    } catch (err) {
      resultsArea.innerHTML = `<div style="color:var(--danger);padding:20px">PubMed検索エラー: ${err.message}</div>`;
      Components.showToast('PubMed検索に失敗しました', 'error');
    }
  }

  loadLatestAnalysis() {
    const latest = store.get('latestAnalysis');
    const resultArea = document.getElementById('analysis-result');
    if (latest && resultArea) {
      this.renderAnalysisResult(latest, resultArea);
    }
  }

  renderAnalysisResult(analysis, container) {
    const p = analysis.parsed || analysis.result;
    if (typeof p === 'string') {
      container.innerHTML = `<div style="white-space:pre-wrap;font-size:13px;line-height:1.8">${Components.formatMarkdown(p)}</div>`;
      return;
    }

    let html = '';
    // Summary
    if (p.summary) {
      html += `<div class="card" style="margin-bottom:20px"><div class="card-body">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:10px">分析サマリー</h3>
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.8">${p.summary}</p>
      </div></div>`;
    }

    // Risk Alerts
    if (p.riskAlerts?.length) {
      html += '<div style="margin-bottom:20px">';
      p.riskAlerts.forEach(a => {
        const c = a.level === 'warning' ? 'var(--warning)' : 'var(--info)';
        html += `<div style="padding:12px 16px;background:${c}15;border-left:3px solid ${c};border-radius:0 8px 8px 0;margin-bottom:8px;font-size:13px;color:var(--text-primary)">${a.message}</div>`;
      });
      html += '</div>';
    }

    // Trends
    if (p.trends) {
      html += '<div class="grid grid-4" style="margin-bottom:20px">';
      const trendLabels = { fatigue: '疲労', pain: '痛み', sleep: '睡眠', cognitive: '認知機能' };
      const trendIcons = { fatigue: '😴', pain: '💢', sleep: '🌙', cognitive: '🧠' };
      Object.entries(p.trends).forEach(([k, v]) => {
        const dir = v.direction === 'improving' ? '改善↑' : v.direction === 'declining' ? '悪化↓' : '安定→';
        const cls = v.direction === 'improving' ? 'positive' : v.direction === 'declining' ? 'negative' : '';
        html += Components.statCard(trendLabels[k] || k, `${trendIcons[k] || ''} ${dir}`, v.change ? v.change * 100 : 0);
      });
      html += '</div>';
    }

    // Recommendations
    if (p.recommendations?.length) {
      html += '<h3 style="font-size:16px;font-weight:600;margin:24px 0 14px">推奨アクション</h3>';
      p.recommendations.forEach(r => { html += Components.recommendationCard(r); });
    }

    // Research
    if (p.researchUpdates?.length) {
      html += '<h3 style="font-size:16px;font-weight:600;margin:24px 0 14px">最新研究</h3>';
      p.researchUpdates.forEach(r => { html += Components.researchCard(r); });
    }

    container.innerHTML = html;
  }

  // ---- Chat ----
  async sendChat() {
    const input = document.getElementById('chat-input');
    if (!input || !input.value.trim()) return;

    const msg = input.value.trim();
    input.value = '';

    const history = store.get('conversationHistory') || [];
    history.push({ role: 'user', content: msg, timestamp: new Date().toISOString() });
    store.set('conversationHistory', history);
    this.renderChatMessages();

    // Generate response
    try {
      const apiKey = aiEngine.getApiKey(store.get('selectedModel'));
      let responseText;

      // Always use AI API for chat responses
      const template = (typeof QUICK_ANALYSIS_PROMPT !== 'undefined') ? QUICK_ANALYSIS_PROMPT : '';
      const prompt = this.buildPrompt(template, { '{{USER_INPUT}}': msg });
      const response = await aiEngine.callModel(
        store.get('selectedModel') || 'claude-sonnet-4-6',
        prompt,
        { maxTokens: 2048 }
      );
      responseText = typeof response === 'string' ? response : (response.summary || JSON.stringify(response));

      history.push({ role: 'assistant', content: responseText, timestamp: new Date().toISOString() });
      store.set('conversationHistory', history);
      this.renderChatMessages();
    } catch (err) {
      history.push({ role: 'assistant', content: 'すみません、応答の生成中にエラーが発生しました。もう一度お試しください。\n\nエラー: ' + err.message, timestamp: new Date().toISOString() });
      store.set('conversationHistory', history);
      this.renderChatMessages();
    }
  }

  renderChatMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const history = store.get('conversationHistory') || [];
    container.innerHTML = history.map(m => Components.chatMessage(m)).join('');
    container.scrollTop = container.scrollHeight;
  }

  // ---- Integrations ----
  importPlaudTranscript() {
    const text = document.getElementById('plaud-transcript')?.value?.trim();
    const title = document.getElementById('plaud-title')?.value?.trim() || 'Plaud会話記録';
    const date = document.getElementById('plaud-date')?.value;

    if (!text) { Components.showToast('テキストを入力してください', 'error'); return; }

    const parsed = Integrations.plaud.parseTranscript(text);
    Integrations.plaud.saveTranscript(parsed, { title, date: date ? new Date(date + 'T12:00:00').toISOString() : undefined });

    document.getElementById('plaud-transcript').value = '';
    document.getElementById('plaud-title').value = '';

    Components.showToast(`会話記録を取り込みました（${parsed.entries.length}発言, ${parsed.wordCount}語）`, 'success');

    // Navigate to dashboard and run AI analysis
    this.navigate('dashboard');
    const conversationInput = `[会話データ] ${title}\n${text.substring(0, 8000)}`;
    const feedbackEl = document.getElementById('dash-ai-feedback');
    this.showFeedbackLoading(feedbackEl, '会話データを分析中...');
    this.runBackgroundAnalysis(conversationInput, feedbackEl);
  }

  connectFitbit() {
    const clientId = document.getElementById('fitbit-client-id')?.value?.trim();
    if (!clientId) { Components.showToast('Client IDを入力してください', 'error'); return; }
    localStorage.setItem('fitbit_client_id', clientId);
    Integrations.fitbit.connect();
  }

  async importFitbitToday() {
    const status = document.getElementById('fitbit-import-status');
    if (status) status.innerHTML = Components.loading('Fitbitからデータを取得中...');
    try {
      await Integrations.fitbit.importToday();
      if (status) status.innerHTML = '<div style="color:var(--success);font-size:13px;padding:10px">今日のデータを取り込みました</div>';
    } catch (err) {
      if (status) status.innerHTML = `<div style="color:var(--danger);font-size:13px;padding:10px">エラー: ${err.message}</div>`;
    }
  }

  async importFitbitHistory() {
    const status = document.getElementById('fitbit-import-status');
    if (status) status.innerHTML = Components.loading('Fitbitから過去7日分を取得中...');
    try {
      await Integrations.fitbit.importHistory(7);
      if (status) status.innerHTML = '<div style="color:var(--success);font-size:13px;padding:10px">過去7日分のデータを取り込みました</div>';
    } catch (err) {
      if (status) status.innerHTML = `<div style="color:var(--danger);font-size:13px;padding:10px">エラー: ${err.message}</div>`;
    }
  }

  async importAppleHealthFile(file) {
    if (!file) return;
    const status = document.getElementById('apple-import-status');
    if (status) status.innerHTML = Components.loading('Apple Healthデータを解析中...');
    try {
      const count = await Integrations.importFile(file);
      if (status) status.innerHTML = `<div style="color:var(--success);font-size:13px;padding:10px">${count}件のデータを取り込みました</div>`;
    } catch (err) {
      if (status) status.innerHTML = `<div style="color:var(--danger);font-size:13px;padding:10px">エラー: ${err.message}</div>`;
    }
  }

  // ---- Theme ----
  // ---- Dynamic Recommendations ----
  generateDynamicRecommendations() {
    const textEntries = store.get('textEntries') || [];
    const allText = textEntries.map(e => e.content || '').join('\n').toLowerCase();
    const diseases = store.get('selectedDiseases') || [];
    const profile = store.get('userProfile') || {};
    const score = store.get('healthScore') || 50;

    // All possible items with relevance scoring
    const items = [
      { id: 'coq10', icon: '💊', name: 'CoQ10（ユビキノール）', desc: 'ミトコンドリアサポート', store: 'iherb', url: 'https://www.iherb.com/search?kw=coq10+ubiquinol&rcode=CHRONICCARE',
        relevance: (allText.includes('倦怠') || allText.includes('疲') || diseases.includes('mecfs') ? 10 : 3) },
      { id: 'magnesium', icon: '✨', name: 'マグネシウム', desc: '筋弛緩・睡眠改善', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=マグネシウム+グリシネート&tag=chroniccare-22',
        relevance: (allText.includes('痛') || allText.includes('眠') || allText.includes('筋肉') ? 10 : 4) },
      { id: 'vitd', icon: '☀️', name: 'ビタミンD3+K2', desc: '免疫・骨代謝', store: 'iherb', url: 'https://www.iherb.com/search?kw=vitamin+d3+k2&rcode=CHRONICCARE',
        relevance: (diseases.some(d => ['sle','ra','hashimoto','osteoporosis'].includes(d)) ? 10 : allText.includes('免疫') ? 8 : 3) },
      { id: 'omega3', icon: '🐟', name: 'オメガ3（EPA/DHA）', desc: '抗炎症・脳機能', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=オメガ3+EPA+DHA&tag=chroniccare-22',
        relevance: (allText.includes('炎症') || allText.includes('頭') || diseases.includes('depression') ? 9 : 4) },
      { id: 'epsom', icon: '🛁', name: 'エプソムソルト', desc: '入浴療法・Mg吸収', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=エプソムソルト&tag=chroniccare-22',
        relevance: (allText.includes('エプソム') || allText.includes('風呂') || allText.includes('入浴') ? 10 : 3) },
      { id: 'nmn', icon: '🧬', name: 'NMN', desc: 'NAD+・細胞修復', store: 'iherb', url: 'https://www.iherb.com/search?kw=NMN+supplement&rcode=CHRONICCARE',
        relevance: (allText.includes('nmn') || allText.includes('老化') || diseases.includes('mecfs') ? 9 : 2) },
      { id: 'melatonin', icon: '🌙', name: 'メラトニン（低用量）', desc: '睡眠リズム調整', store: 'iherb', url: 'https://www.iherb.com/search?kw=melatonin+0.5mg&rcode=CHRONICCARE',
        relevance: (allText.includes('不眠') || allText.includes('眠れ') || diseases.includes('insomnia') ? 10 : 2) },
      { id: 'probiotics', icon: '🦠', name: 'プロバイオティクス', desc: '腸内環境改善', store: 'iherb', url: 'https://www.iherb.com/search?kw=probiotics+lactobacillus&rcode=CHRONICCARE',
        relevance: (allText.includes('腸') || allText.includes('お腹') || diseases.includes('ibs') || diseases.includes('crohns') ? 10 : 3) },
      { id: 'bcomplex', icon: '⚡', name: 'ビタミンB群', desc: 'エネルギー代謝・神経', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=ビタミンB群+コンプレックス&tag=chroniccare-22',
        relevance: (allText.includes('ビタミンb') || allText.includes('エネルギー') || diseases.includes('mecfs') ? 8 : 3) },
      { id: 'ltheanine', icon: '🍵', name: 'L-テアニン', desc: 'リラックス・集中', store: 'iherb', url: 'https://www.iherb.com/search?kw=l-theanine&rcode=CHRONICCARE',
        relevance: (allText.includes('不安') || allText.includes('ストレス') || diseases.includes('gad') || diseases.includes('adhd') ? 9 : 2) },
      { id: 'creatine', icon: '💪', name: 'クレアチン', desc: '筋力・脳エネルギー', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=クレアチン+モノハイドレート&tag=chroniccare-22',
        relevance: (allText.includes('クレアチン') || allText.includes('筋') || diseases.includes('mecfs') ? 8 : 2) },
      { id: 'ashwagandha', icon: '🌿', name: 'アシュワガンダ', desc: '副腎サポート・ストレス', store: 'iherb', url: 'https://www.iherb.com/search?kw=ashwagandha+ksm66&rcode=CHRONICCARE',
        relevance: (allText.includes('アシュワガンダ') || allText.includes('副腎') || allText.includes('ストレス') ? 9 : 2) },
      { id: 'curcumin', icon: '🟡', name: 'クルクミン', desc: '抗炎症・関節サポート', store: 'iherb', url: 'https://www.iherb.com/search?kw=curcumin+bcm95&rcode=CHRONICCARE',
        relevance: (allText.includes('炎症') || allText.includes('関節') || diseases.includes('ra') || diseases.includes('fibromyalgia') ? 9 : 2) },
      { id: 'zinc', icon: '🔩', name: '亜鉛', desc: '免疫・ホルモン', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=亜鉛+サプリメント&tag=chroniccare-22',
        relevance: (allText.includes('亜鉛') || allText.includes('免疫') || allText.includes('性欲') ? 8 : 3) },
      { id: 'pea', icon: '🧪', name: 'PEA（パルミトイルエタノールアミド）', desc: '神経障害性疼痛', store: 'iherb', url: 'https://www.iherb.com/search?kw=palmitoylethanolamide+PEA&rcode=CHRONICCARE',
        relevance: (allText.includes('疼痛') || allText.includes('神経痛') || diseases.includes('fibromyalgia') ? 10 : 1) },
      { id: 'oura', icon: '⌚', name: 'Oura Ring（HRVモニター）', desc: '自律神経・睡眠トラッキング', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=oura+ring&tag=chroniccare-22',
        relevance: (allText.includes('hrv') || allText.includes('ペーシング') || diseases.includes('pots') || diseases.includes('mecfs') ? 8 : 2) },
      { id: 'gut_test', icon: '🔬', name: '腸内フローラ検査キット', desc: '腸内細菌叢の分析', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=腸内フローラ+検査キット&tag=chroniccare-22',
        relevance: (allText.includes('腸') || diseases.includes('ibs') || diseases.includes('crohns') ? 9 : 2) },
      { id: 'gene_test', icon: '🧬', name: '遺伝子検査キット', desc: '疾患リスク・薬剤代謝', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=遺伝子検査キット&tag=chroniccare-22',
        relevance: (allText.includes('遺伝') ? 8 : 1) },
      // Japanese products
      { id: 'kampo_hochu', icon: '🌿', name: '補中益気湯（漢方）', desc: '疲労・免疫低下・食欲不振', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=補中益気湯+ツムラ&tag=chroniccare-22',
        relevance: (allText.match(/倦怠|疲|だるい|食欲/) ? 9 : diseases.includes('mecfs') ? 6 : 2) },
      { id: 'kampo_goreisan', icon: '🌿', name: '五苓散（漢方）', desc: '気象病・頭痛・むくみ', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=��苓散+ツムラ&tag=chroniccare-22',
        relevance: (allText.match(/気圧|天候|頭痛|むくみ/) ? 10 : 2) },
      { id: 'kampo_kamishoyosan', icon: '🌿', name: '加味逍遙散（漢方）', desc: '更年期・イライラ・不眠', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=加味���遙散+クラシエ&tag=chroniccare-22',
        relevance: (allText.match(/更年期|イライラ|のぼせ|不眠/) ? 9 : profile.gender === 'female' ? 4 : 1) },
      { id: 'ala5', icon: '✨', name: '5-ALA（アミノレブリン酸）', desc: 'ミトコンドリア活性・日本発', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=5-ALA+サプリ&tag=chroniccare-22',
        relevance: (allText.match(/ミ���コンドリア|5-ala|エネルギー/) ? 9 : diseases.includes('mecfs') ? 6 : 2) },
      { id: 'hydrogen', icon: '💧', name: '水素水生成器', desc: '抗酸化・日本発テクノロジー', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=水素水+生成器&tag=chroniccare-22',
        relevance: (allText.match(/水素|酸化|抗���化/) ? 8 : 1) },
      { id: 'omron_bp', icon: '🩺', name: 'OMRON 血圧計', desc: '日本精密機器・家庭測定', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=オ��ロン+血圧計&tag=chroniccare-22',
        relevance: (allText.match(/血圧|高血圧/) ? 9 : diseases.includes('hypertension') ? 7 : 1) },
      { id: 'tanita_scale', icon: '⚖️', name: 'TANITA 体組成計', desc: '日本精密機器・体脂肪率', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=タニタ+体組成計&tag=chroniccare-22',
        relevance: (allText.match(/体重|体脂肪|肥満|ダイエット/) ? 8 : diseases.includes('metabolic_syndrome') ? 6 : 1) },
      { id: 'miso', icon: '🫘', name: '有機味噌（発酵食品）', desc: '腸内環境・免疫・日本の智慧', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=有機+味噌+無添加&tag=chroniccare-22',
        relevance: (allText.match(/腸|発酵|免疫|食事/) ? 7 : 2) },
      { id: 'amazake', icon: '🍶', name: '甘酒（飲む点滴）', desc: '発酵・栄養補給・日本伝統', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=甘酒+米麹+無添加&tag=chroniccare-22',
        relevance: (allText.match(/栄養|疲労|発酵|甘酒/) ? 7 : 2) },
      { id: 'epsom_jp', icon: '♨️', name: 'エプソムソルト（国産）', desc: '入浴・Mg吸収・日本品質', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=エプ��ムソルト+国産&tag=chroniccare-22',
        relevance: (allText.match(/風呂|入浴|エプソム|マグネシウム/) ? 9 : 3) },
      { id: 'shinrinyoku', icon: '🌲', name: '森林浴ガイドブック', desc: 'Shinrin-yoku・日本発セラピー', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=森���浴+ガイド&tag=chroniccare-22',
        relevance: (allText.match(/自然|森|散歩|リラックス/) ? 6 : 1) },
      { id: 'evening_primrose', icon: '🌸', name: '月見草オイル', desc: 'PMS・ホルモンバランス', store: 'iherb', url: 'https://www.iherb.com/search?kw=evening+primrose+oil&rcode=CHRONICCARE',
        relevance: (allText.match(/生理|月経|pms|ホルモン|更年期/) ? 10 : profile.gender === 'female' ? 4 : 0) },
      { id: 'equol', icon: '🫘', name: 'エクオール', desc: '更年期・女性ホルモン', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=エクオール+サプリ&tag=chroniccare-22',
        relevance: (allText.match(/更年期|ホットフラッシュ|のぼせ/) ? 10 : profile.gender === 'female' && parseInt(profile.age) >= 40 ? 5 : 0) },
      { id: 'iron', icon: '🩸', name: '鉄分（ヘム鉄）', desc: '貧血・疲労対策', store: 'iherb', url: 'https://www.iherb.com/search?kw=heme+iron&rcode=CHRONICCARE',
        relevance: (allText.match(/貧血|鉄|フェリチン|めまい|立ちくらみ/) ? 10 : profile.gender === 'female' ? 4 : 1) },
      { id: 'ginger', icon: '🫚', name: 'ジンジャーサプリ', desc: '吐き気・消化・抗炎症', store: 'iherb', url: 'https://www.iherb.com/search?kw=ginger+extract&rcode=CHRONICCARE',
        relevance: (allText.match(/吐き気|嘔吐|気持ち悪|消化|胃/) ? 9 : 1) },
      { id: 'psyllium', icon: '🌾', name: 'サイリウムハスク', desc: '食物繊維・腸内環境', store: 'amazon', url: 'https://www.amazon.co.jp/s?k=サイリウムハスク&tag=chroniccare-22',
        relevance: (allText.match(/便秘|腸|食物繊維/) ? 9 : diseases.includes('ibs') ? 6 : 1) },
      { id: 'headache_app', icon: '📱', name: '頭痛ーる（アプリ）', desc: '気圧予報・頭痛予防', store: 'amazon', url: 'https://zutool.jp/',
        relevance: (allText.match(/頭痛|偏頭痛|片頭痛|気圧/) ? 10 : 1) },
      { id: 'feverfew', icon: '🌼', name: 'フィーバーフュー', desc: '片頭痛予防ハーブ', store: 'iherb', url: 'https://www.iherb.com/search?kw=feverfew&rcode=CHRONICCARE',
        relevance: (allText.match(/頭痛|偏頭痛|片頭痛/) ? 9 : 0) },
    ];

    // Add recency bonus: if mentioned in last 3 entries, boost relevance
    const recentText = textEntries.slice(-3).map(e => (e.content || '').toLowerCase()).join('\n');
    items.forEach(item => {
      const keywords = item.name.toLowerCase().split(/[（）/・]+/).filter(k => k.length > 1);
      if (keywords.some(k => recentText.includes(k))) item.relevance += 5;
    });

    // Low health score boosts energy/recovery items
    if (score < 40) {
      items.find(i => i.id === 'coq10').relevance += 3;
      items.find(i => i.id === 'bcomplex').relevance += 3;
      items.find(i => i.id === 'magnesium').relevance += 2;
    }

    // Sort by relevance and pick top 6
    items.sort((a, b) => b.relevance - a.relevance);
    return items.slice(0, 6);
  }

  // ---- Timeline ----
  filterTimeline(type) {
    // Re-render with filter
    const content = document.getElementById('timeline-content');
    if (!content) return;

    const items = content.querySelectorAll('.card, [style*="bg-tertiary"]');
    // Simple approach: re-navigate to refresh, store filter
    store.set('_timelineFilter', type);
    this.navigate('timeline');
  }

  // Generate quick AI insight for timeline entries
  generateQuickInsight(text) {
    if (!text || text.length < 10) return '';
    const lower = text.toLowerCase();

    // Pattern-based quick insights
    if (/pem|労作後|倦怠感がひどい|動けな/.test(lower)) return 'PEMの兆候。24-48時間の安静を推奨。活動量の見直しが必要です。';
    if (/疼痛|痛[いみ]|頭痛/.test(lower)) return '疼痛記録。痛みの時間帯・トリガーのパターンを追跡中。';
    if (/頭痛|偏頭痛|片頭痛/.test(lower)) return '頭痛パターンを追跡中。頻度・トリガー（気圧/食事/ストレス/生理周期）の記録が予防に繋がります。';
    if (/生理|月経|pms|ホルモン/.test(lower)) return '月経・ホルモン周期を追跡中。体調との相関分析で症状予防が可能になります。';
    if (/更年期|ホットフラッシュ/.test(lower)) return '更年期症状の記録。エクオール・漢方・HRT等の選択肢を主治医と相談してください。';
    if (/お腹|下痢|便秘|吐き気|胃/.test(lower)) return '消化器症状を追跡中。食事内容との相関が見えてくると改善策が明確に。';
    if (/めまい|ふらつき|立ちくらみ/.test(lower)) return 'めまいの記録。水分・塩分摂取量と起立時の状況を合わせて記録すると診断の助けに。';
    if (/肌荒れ|かゆ|湿疹|アトピー/.test(lower)) return '皮膚症状を記録中。食事・ストレス・環境との相関を分析しています。';
    if (/息苦し|呼吸|胸が/.test(lower)) return '呼吸器症状の記録。腹式呼吸の練習と姿勢改善が基本的な対策です。';
    if (/だるい|倦怠|疲れ/.test(lower)) return '疲労の記録。鉄・ビタミンB12・甲状腺機能の検査を検討してください。';
    if (/鬱|孤独|辛|死|ネガティ|絶望/.test(lower)) return '精神面のケアが重要です。信頼できる方への連絡を検討してください。';
    if (/眠[れり]|不眠|寝[れた]/.test(lower)) return '睡眠パターンを追跡中。睡眠衛生の見直しで改善の可能性があります。';
    if (/先生|診察|クリニック|病院/.test(lower)) return '医療記録。次回診察に向けてこの記録を共有することを推奨。';
    if (/ツートラム|リンデロン|エチゾラム|ステロイド|プレドニゾ/.test(lower)) return '服薬メモ。効果と副作用を追跡しています。';
    if (/コエンザイム|nmn|ビタミン|マグネシウム|サプリ/.test(lower)) return 'サプリメント記録。効果評価のため2-4週間の継続観察を。';
    if (/良[いか]|楽|元気|調子が良|できた|回復/.test(lower)) return '改善傾向。何が効果的だったか分析し、再現性を高めましょう。';
    if (/エプソムソルト|風呂|入浴/.test(lower)) return '入浴療法の記録。マグネシウム吸収と自律神経調整の効果を追跡。';
    if (/瞑想|呼吸法|ヨガ/.test(lower)) return '迷走神経トーニング効果を記録中。継続が自律神経改善の鍵です。';
    if (/気圧|天候|天気/.test(lower)) return '気象感受性を記録。気圧変動と症状の相関を分析しています。';
    if (/ジム|運動|散歩|ストレッチ/.test(lower)) return '活動記録。翌日のPEM有無を確認し、安全な活動量を学習中。';
    if (/食[べ事]|ご飯|料理/.test(lower)) return '食事記録。栄養バランスと体調の相関を分析中。';

    // Generic insight based on text length
    if (text.length > 200) return '詳細な記録です。AI分析でより深い洞察を得られます。';
    if (text.length > 50) return '記録を継続中。パターン分析の精度が向上しています。';
    return '';
  }

  // ---- Prompt Template Helper ----
  buildPrompt(template, extraVars = {}) {
    const diseases = store.get('selectedDiseases') || [];
    const profile = store.get('userProfile') || {};
    const recentEntries = (store.get('textEntries') || []).slice(-5).map(e => e.content || '').join('\n---\n');

    const vars = {
      '{{SELECTED_DISEASES}}': diseases.join(', ') || '未設定',
      '{{LOCATION}}': profile.location || '日本',
      '{{AGE}}': profile.age || '未設定',
      '{{RECENT_ENTRIES}}': (recentEntries || '').substring(0, 3000),
      '{{DATE}}': new Date().toLocaleDateString('ja-JP'),
      ...extraVars
    };

    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.split(key).join(value);
    }
    return result;
  }

  // ---- Show AI Response in Feedback Area ----
  showAIFeedback(feedbackEl, response, tag = 'AI応答') {
    if (!feedbackEl || typeof response !== 'string' || response.length < 20) return;
    feedbackEl.innerHTML = `
      <div class="card" style="border-left:4px solid var(--success)">
        <div class="card-header" style="padding:10px 16px">
          <span style="font-size:13px;font-weight:600">詳細分析</span>
          <span class="tag tag-success" style="font-size:9px">${tag}</span>
        </div>
        <div class="card-body" style="padding:14px 16px">
          <div style="font-size:13px;color:var(--text-primary);line-height:1.8;white-space:pre-wrap">${Components.formatMarkdown(response)}</div>
        </div>
      </div>`;

    // Save to latestFeedback for persistence
    store.set('latestFeedback', {
      timestamp: new Date().toISOString(),
      detected: ['AI分析'],
      urgency: 'normal',
      isPositive: false,
      sections: [{ title: '分析結果', icon: '🤖', content: response.substring(0, 2000) }],
      rawResponse: response
    });
  }

  // ---- Show Loading State in Feedback Area ----
  showFeedbackLoading(feedbackEl, message = 'AIが分析中です...') {
    if (!feedbackEl) return;
    feedbackEl.innerHTML = `
      <div class="card" style="border-left:4px solid var(--accent)">
        <div class="card-body" style="padding:20px;text-align:center">
          <div class="spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto 10px"></div>
          <div style="font-size:13px;color:var(--text-muted)">${message}</div>
        </div>
      </div>`;
  }

  // ---- Dashboard Quick Input ----
  async dashQuickSubmit() {
    const input = document.getElementById('dash-quick-input');
    if (!input || !input.value.trim()) {
      Components.showToast('テキストを入力してください', 'error');
      return;
    }

    const content = input.value.trim();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      timestamp: new Date().toISOString(),
      category: 'symptoms',
      type: 'text_entry',
      title: '',
      content: content
    };

    const textEntries = store.get('textEntries') || [];
    textEntries.push(entry);
    store.set('textEntries', textEntries);

    const history = store.get('conversationHistory') || [];
    history.push({ role: 'user', content: content, timestamp: entry.timestamp, type: 'data_entry' });
    store.set('conversationHistory', history);

    input.value = '';

    // Re-render dashboard and show loading state
    this.navigate('dashboard');
    const feedbackEl = document.getElementById('dash-ai-feedback');
    this.showFeedbackLoading(feedbackEl, '入力内容を分析中...');

    // Always call AI API for analysis
    await this.runBackgroundAnalysis(content, feedbackEl);
  }

  // [REMOVED] generateDeepAnalysis - replaced by AI API calls via QUICK_ANALYSIS_PROMPT in config.js

  async runBackgroundAnalysis(userInput, feedbackEl) {
    try {
      // Build prompt from config template (QUICK_ANALYSIS_PROMPT)
      const template = (typeof QUICK_ANALYSIS_PROMPT !== 'undefined') ? QUICK_ANALYSIS_PROMPT : '';
      const prompt = this.buildPrompt(template, { '{{USER_INPUT}}': userInput });

      const response = await aiEngine.callModel(store.get('selectedModel') || 'claude-sonnet-4-6', prompt, { maxTokens: 2048 });
      this.showAIFeedback(feedbackEl, response, 'AI分析');
    } catch (err) {
      console.warn('[Background Analysis] Failed:', err.message);
      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <div class="card" style="border-left:4px solid var(--danger)">
            <div class="card-body" style="padding:14px 16px">
              <div style="font-size:13px;color:var(--danger);font-weight:600;margin-bottom:6px">分析エラー</div>
              <div style="font-size:12px;color:var(--text-secondary)">${err.message}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:8px">APIキーが設定されているか確認してください（設定 → AIモデル）</div>
            </div>
          </div>`;
      }
    }
  }

  dashQuickFile(event) {
    const files = event.target.files;
    if (!files.length) return;

    Components.showToast(`${files.length}件のファイルを処理中...`, 'info');

    Array.from(files).forEach(async (file) => {
      // Determine file category from type and name
      const isImage = file.type.startsWith('image/');
      const isPDF = file.type === 'application/pdf';
      const fileName = file.name.toLowerCase();

      // Auto-categorize
      let category = 'その他';
      let analysisPrompt = '';
      if (isImage) {
        // Images are likely: food photos, test results, prescriptions, skin conditions
        category = '写真';
        analysisPrompt = `[写真アップロード] ${file.name}
これは画像ファイルです。以下の可能性があります：

【食事写真の場合】
・写真に写っている料理の推定カロリー、栄養バランス（タンパク質/脂質/炭水化物）を分析
・慢性疾患との関連（抗炎症食か、血糖値への影響、腸内環境への影響）
・改善提案（不足している栄養素、追加すべき食材）
・この食事の良い点と注意点

【検査結果写真の場合】
・数値を読み取り、基準値との比較
・異常値があれば具体的なアクション提案

【処方箋/お薬手帳の場合】
・薬の飲み合わせチェック
・副作用の注意点

写真の内容に応じて適切な分析を提供してください。`;
      } else if (isPDF || fileName.includes('検査') || fileName.includes('test') || fileName.includes('result')) {
        category = '検査結果';
        analysisPrompt = `[検査結果ファイル] ${file.name} - 検査データの分析と基準値比較、要注意項目の指摘をしてください。`;
      } else {
        analysisPrompt = `[ファイル] ${file.name} (${file.type}) - このファイルの内容を分析してください。`;
      }

      // Save file
      const reader = new FileReader();
      reader.onload = (ev) => {
        store.addHealthData('photos', {
          filename: file.name, type: file.type, size: file.size,
          dataUrl: isImage ? ev.target.result.substring(0, 500) : '',
          category: category
        });

        // Save to text entries for timeline
        const textEntries = store.get('textEntries') || [];
        textEntries.push({
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          timestamp: new Date().toISOString(),
          category: category,
          type: 'file_upload',
          title: `📎 ${file.name}`,
          content: `${category}をアップロードしました（${(file.size/1024).toFixed(0)}KB）`
        });
        store.set('textEntries', textEntries);

        // Add to conversation history
        const history = store.get('conversationHistory') || [];
        history.push({
          role: 'user', content: analysisPrompt,
          timestamp: new Date().toISOString(), type: 'file_upload'
        });
        store.set('conversationHistory', history);

        Components.showToast(`${file.name} を分析中...`, 'info');
        this.navigate('dashboard');

        // Show loading state and run AI analysis
        const feedbackEl = document.getElementById('dash-ai-feedback');
        this.showFeedbackLoading(feedbackEl, `${file.name} を分析中...`);

        if (isImage) {
          setTimeout(() => this.runImageAnalysis(ev.target.result, file.name, category, feedbackEl), 300);
        } else {
          setTimeout(() => this.runBackgroundAnalysis(analysisPrompt, feedbackEl), 300);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // Image analysis using Vision API - prompt from config.js (IMAGE_ANALYSIS_PROMPT)
  async runImageAnalysis(imageBase64, fileName, category, feedbackEl) {
    try {
      const recentMeds = (store.get('textEntries') || [])
        .filter(e => (e.content || '').match(/薬|ツートラム|リンデロン|エチゾラム|ステロイド|サプリ|ビタミン/))
        .slice(-3).map(e => e.content).join('\n');
      const medsSection = recentMeds ? '【最近の服薬記録】\n' + recentMeds.substring(0, 500) : '';

      // Build prompt from config template
      const template = (typeof IMAGE_ANALYSIS_PROMPT !== 'undefined') ? IMAGE_ANALYSIS_PROMPT : '';
      const prompt = this.buildPrompt(template, { '{{RECENT_MEDS}}': medsSection });

      const visionSystemPrompt = (typeof AI_SYSTEM_PROMPTS !== 'undefined' && AI_SYSTEM_PROMPTS.vision) || '';

      const model = store.get('selectedModel') || 'claude-sonnet-4-6';
      const response = await aiEngine.callModel(model, prompt, {
        maxTokens: 4096,
        imageBase64: imageBase64,
        systemPrompt: visionSystemPrompt
      });

      this.showAIFeedback(feedbackEl, response, '📸 Vision分析');
    } catch (err) {
      console.warn('[Image Analysis] Failed:', err.message);
      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <div class="card" style="border-left:4px solid var(--danger)">
            <div class="card-body" style="padding:14px 16px">
              <div style="font-size:13px;color:var(--danger);font-weight:600;margin-bottom:6px">画像分析エラー</div>
              <div style="font-size:12px;color:var(--text-secondary)">${err.message}</div>
            </div>
          </div>`;
      }
    }
  }

  // [REMOVED] generateFileAnalysis - replaced by AI API calls via IMAGE_ANALYSIS_PROMPT / runBackgroundAnalysis

  // ---- Data Page File Upload ----
  dataPageFileUpload(files) {
    if (!files || !files.length) return;
    const resultEl = document.getElementById('data-file-result');
    if (resultEl) resultEl.innerHTML = Components.loading('ファイルを処理中...');

    Array.from(files).forEach(async (file) => {
      const textForAnalysis = [];

      if (!file.type.startsWith('image/')) {
        try {
          const count = await Integrations.importFile(file);
          if (count > 0) textForAnalysis.push(`[ファイル取込] ${file.name}: ${count}件のデータ`);
        } catch(e) { /* fall through */ }
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        store.addHealthData('photos', {
          filename: file.name, type: file.type, size: file.size,
          dataUrl: file.type.startsWith('image/') ? ev.target.result.substring(0, 500) : '',
          category: 'general'
        });

        textForAnalysis.push(`[ファイル] ${file.name} (${file.type}, ${(file.size/1024).toFixed(0)}KB)`);

        const history = store.get('conversationHistory') || [];
        history.push({ role: 'user', content: textForAnalysis.join('\n'), timestamp: new Date().toISOString(), type: 'file_upload' });
        store.set('conversationHistory', history);

        const isImage = file.type.startsWith('image/');

        Components.showToast(`${file.name} を保存しました`, 'success');

        // Run AI analysis
        if (resultEl) {
          resultEl.innerHTML = `<div class="card" style="border-left:4px solid var(--accent)"><div class="card-body" style="text-align:center;padding:20px"><div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto 8px"></div><div style="font-size:12px;color:var(--text-muted)">${file.name} を分析中...</div></div></div>`;
          const analysisInput = textForAnalysis.join('\n');
          if (isImage) {
            this.runImageAnalysis(ev.target.result, file.name, '写真', resultEl);
          } else {
            this.runBackgroundAnalysis(analysisInput, resultEl);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- User Profile ----
  saveDiseaseSettings() {
    const checkboxes = document.querySelectorAll('.settings-disease-cb');
    const selected = [];
    checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });
    store.set('selectedDiseases', selected);

    // Set primary disease
    if (selected.length > 0) {
      for (const cat of CONFIG.DISEASE_CATEGORIES) {
        const found = cat.diseases.find(d => d.id === selected[0]);
        if (found) {
          store.set('selectedDisease', { id: found.id, name: found.name, fullName: found.name, icon: cat.icon, color: '#6C63FF' });
          break;
        }
      }
    }

    if (FirebaseBackend.initialized) {
      FirebaseBackend.saveProfile({ settings: { selectedDiseases: selected, selectedDisease: store.get('selectedDisease') } });
    }

    const countEl = document.getElementById('settings-disease-count');
    if (countEl) countEl.textContent = selected.length + '件選択';
    Components.showToast(`${selected.length}件の疾患を保存しました`, 'success');
  }

  saveProfile() {
    const profile = {
      age: document.getElementById('profile-age')?.value || '',
      gender: document.getElementById('profile-gender')?.value || '',
      height: document.getElementById('profile-height')?.value || '',
      weight: document.getElementById('profile-weight')?.value || '',
      location: document.getElementById('profile-location')?.value || '',
      travelRange: document.getElementById('profile-travel-range')?.value || 'region',
      language: document.getElementById('profile-language')?.value || 'ja',
      notes: document.getElementById('profile-notes')?.value || ''
    };
    store.set('userProfile', profile);
    if (FirebaseBackend.initialized) {
      FirebaseBackend.saveProfile({ userProfile: profile });
    }
    Components.showToast('プロフィールを保存しました', 'success');
  }

  loadProfileFields() {
    const profile = store.get('userProfile') || {};
    const fields = { age: 'profile-age', gender: 'profile-gender', height: 'profile-height', weight: 'profile-weight', location: 'profile-location', travelRange: 'profile-travel-range', language: 'profile-language', notes: 'profile-notes' };
    Object.entries(fields).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el && profile[key]) el.value = profile[key];
    });
  }

  // ---- Sidebar (mobile) ----
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.style.display = isOpen ? 'block' : 'none';
  }

  closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
  }

  toggleTheme() {
    const t = store.get('theme') === 'dark' ? 'light' : 'dark';
    store.set('theme', t);
  }

  // ---- Admin ----
  savePrompt(key) {
    const nameEl = document.querySelector(`[data-prompt-name="${key}"]`);
    const textEl = document.querySelector(`[data-prompt-text="${key}"]`);
    const diseaseEl = document.querySelector(`[data-prompt-disease="${key}"]`);
    const scheduleEl = document.querySelector(`[data-prompt-schedule="${key}"]`);
    if (!nameEl || !textEl) return;

    const prompts = store.get('customPrompts') || {};
    prompts[key] = {
      ...prompts[key],
      name: nameEl.value,
      prompt: textEl.value,
      disease: diseaseEl ? diseaseEl.value : (prompts[key]?.disease || '_universal'),
      schedule: scheduleEl ? scheduleEl.value : (prompts[key]?.schedule || 'manual'),
      active: true
    };
    store.set('customPrompts', prompts);
    Components.showToast(`「${nameEl.value}」を保存しました`, 'success');
  }

  // ---- Admin Tab Navigation ----
  switchAdminTab(tabId) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#admin-tabs .tab').forEach(el => el.classList.remove('active'));

    const target = document.getElementById('admin-tab-' + tabId);
    if (target) target.style.display = 'block';

    const tabs = document.querySelectorAll('#admin-tabs .tab');
    const tabNames = ['prompts', 'models', 'api', 'affiliate', 'firebase', 'data'];
    const idx = tabNames.indexOf(tabId);
    if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');

    // Load fields for specific tabs
    if (tabId === 'api') this.loadApiKeyFields();
    if (tabId === 'firebase') this.loadFirebaseConfigFields();
  }

  togglePromptEdit(key) {
    const el = document.getElementById('prompt-edit-' + key);
    if (!el) return;
    const isOpen = el.style.display !== 'none';
    el.style.display = isOpen ? 'none' : 'block';
  }

  filterPrompts(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.prompt-item').forEach(el => {
      const name = el.querySelector('[data-prompt-name]')?.value?.toLowerCase() || '';
      el.style.display = name.includes(q) || q === '' ? '' : 'none';
    });
  }

  filterPromptsByDisease(diseaseId) {
    document.querySelectorAll('.prompt-item').forEach(el => {
      const d = el.dataset.disease || '_universal';
      el.style.display = !diseaseId || d === diseaseId ? '' : 'none';
    });
  }

  resetPromptsToDefault() {
    if (!confirm('すべてのプロンプトをデフォルトに戻しますか？カスタム変更は失われます。')) return;
    store.set('customPrompts', {});  // Clear overrides so DEFAULT_PROMPTS shines through
    Components.showToast(`プロンプトをデフォルトに戻しました（${Object.keys(DEFAULT_PROMPTS).length}件）`, 'success');
    this.navigate('admin');
  }

  addNewPrompt() {
    const key = 'custom_' + Date.now();
    const prompts = store.get('customPrompts') || {};
    prompts[key] = {
      name: '新しいプロンプト',
      disease: '_universal',
      description: '',
      prompt: PROMPT_HEADER + 'ここにプロンプトを入力してください...\n\n{{USER_DATA}} や {{SELECTED_DISEASES}} 等の変数が使えます。',
      schedule: 'manual',
      active: true
    };
    store.set('customPrompts', prompts);
    this.navigate('admin');
    // Auto-open the new prompt
    setTimeout(() => this.togglePromptEdit(key), 100);
  }

  deletePrompt(key) {
    const prompts = store.get('customPrompts') || {};
    delete prompts[key];
    store.set('customPrompts', prompts);
    this.navigate('admin');
    Components.showToast('プロンプトを削除しました', 'info');
  }

  addAdmin() {
    const input = document.getElementById('new-admin-email');
    if (!input || !input.value.trim() || !input.value.includes('@')) {
      Components.showToast('有効なメールアドレスを入力してください', 'error');
      return;
    }
    const email = input.value.trim().toLowerCase();
    if (this.ADMIN_EMAILS.includes(email)) {
      Components.showToast('既に管理者です', 'error');
      return;
    }
    this.ADMIN_EMAILS.push(email);
    localStorage.setItem('admin_emails', JSON.stringify(this.ADMIN_EMAILS.filter(e => e !== 'agewaller@gmail.com')));
    if (FirebaseBackend.initialized) {
      FirebaseBackend.saveProfile({ adminEmails: this.ADMIN_EMAILS });
    }
    input.value = '';
    Components.showToast(`${email} を管理者に追加しました`, 'success');
    this.navigate('admin');
  }

  removeAdmin(email) {
    if (email === 'agewaller@gmail.com') {
      Components.showToast('オーナーは削除できません', 'error');
      return;
    }
    this.ADMIN_EMAILS = this.ADMIN_EMAILS.filter(e => e !== email);
    localStorage.setItem('admin_emails', JSON.stringify(this.ADMIN_EMAILS.filter(e => e !== 'agewaller@gmail.com')));
    Components.showToast(`${email} を管理者から削除しました`, 'info');
    this.navigate('admin');
  }

  setModel(modelId) {
    store.set('selectedModel', modelId);
    // Persist to Firestore so it survives reload
    if (FirebaseBackend.initialized) {
      FirebaseBackend.saveProfile({ settings: { selectedModel: modelId } });
    }
    Components.showToast(`モデルを ${modelId} に変更しました`, 'success');
  }

  saveAffiliateConfig(e) {
    e.preventDefault();
    const form = e.target;
    CONFIG.AFFILIATE_NETWORKS.forEach(n => {
      const tagInput = form.querySelector(`[name="aff_${n.id}"]`);
      if (tagInput && tagInput.value) {
        affiliateEngine.updateConfig(n.id, { tag: tagInput.value });
      }
    });
    Components.showToast('アフィリエイト設定を保存しました', 'success');
  }

  // ---- Dashboard Charts ----
  initDashboardCharts() {
    // Symptom trend chart
    const sympCtx = document.getElementById('symptom-chart');
    if (sympCtx && typeof Chart !== 'undefined') {
      if (this.chartInstances.symptom) this.chartInstances.symptom.destroy();

      const symptoms = store.get('symptoms') || [];
      const last14 = symptoms.slice(-14);
      const labels = last14.map(s => {
        const d = new Date(s.timestamp);
        return `${d.getMonth()+1}/${d.getDate()}`;
      });

      this.chartInstances.symptom = new Chart(sympCtx, {
        type: 'line',
        data: {
          labels: labels.length ? labels : ['データなし'],
          datasets: [
            {
              label: '疲労度',
              data: last14.map(s => s.fatigue_level || 0),
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239,68,68,0.1)',
              tension: 0.3, fill: true
            },
            {
              label: '痛み',
              data: last14.map(s => s.pain_level || 0),
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245,158,11,0.1)',
              tension: 0.3, fill: true
            },
            {
              label: 'ブレインフォグ',
              data: last14.map(s => s.brain_fog || 0),
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139,92,246,0.1)',
              tension: 0.3, fill: true
            },
            {
              label: '睡眠品質',
              data: last14.map(s => s.sleep_quality || 0),
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34,197,94,0.1)',
              tension: 0.3, fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { min: 0, max: 7, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8896b0' } },
            x: { grid: { display: false }, ticks: { color: '#8896b0' } }
          },
          plugins: {
            legend: { labels: { color: '#8896b0', font: { size: 11 } } }
          }
        }
      });
    }
  }

  // ---- Generate Demo Data ----
  generateDemoData() {
    const now = new Date();
    for (let i = 30; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ts = d.toISOString();

      store.addHealthData('symptoms', {
        timestamp: ts,
        fatigue_level: Math.floor(Math.random() * 4) + 2,
        pain_level: Math.floor(Math.random() * 3) + 1,
        brain_fog: Math.floor(Math.random() * 4) + 1,
        sleep_quality: Math.floor(Math.random() * 3) + 2,
        pem_status: Math.random() > 0.7
      });

      store.addHealthData('vitals', {
        timestamp: ts,
        heart_rate: Math.floor(Math.random() * 30) + 60,
        temperature: (36 + Math.random() * 1.5).toFixed(1),
        spo2: Math.floor(Math.random() * 3) + 96
      });
    }
    store.calculateHealthScore();
    Components.showToast('デモデータを生成しました', 'success');
    this.navigate('dashboard');
  }
};

var app = new App();
