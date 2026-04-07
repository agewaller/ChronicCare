/* ============================================================
   UI Components
   Reusable component renderers for the dashboard
   ============================================================ */

var Components = {
  // Health Score Gauge
  healthGauge(score, size = 180) {
    const r = (size - 20) / 2;
    const c = Math.PI * 2 * r;
    const offset = c - (score / 100) * c;
    const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';

    return `
      <div class="health-gauge" style="width:${size}px;height:${size}px">
        <svg class="health-gauge-circle" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle class="health-gauge-bg" cx="${size/2}" cy="${size/2}" r="${r}"/>
          <circle class="health-gauge-progress" cx="${size/2}" cy="${size/2}" r="${r}"
            stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
        </svg>
        <div class="health-gauge-center">
          <div class="health-gauge-value" style="color:${color}">${score}</div>
          <div class="health-gauge-label">Health Score</div>
        </div>
      </div>
    `;
  },

  // Severity Bar
  severityBar(value, max = 7) {
    const pct = (value / max) * 100;
    const level = CONFIG.SEVERITY_LEVELS[Math.min(value, 7)] || CONFIG.SEVERITY_LEVELS[0];
    return `
      <div style="display:flex;align-items:center;gap:10px;margin:4px 0">
        <div class="severity-bar" style="flex:1">
          <div class="severity-fill" style="width:${pct}%;background:${level.color}"></div>
        </div>
        <span style="font-size:11px;color:${level.color};font-weight:600;min-width:50px">${level.label}</span>
      </div>
    `;
  },

  // Stat Card
  statCard(label, value, change, icon) {
    const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : '';
    const changeIcon = change > 0 ? '↑' : change < 0 ? '↓' : '→';
    return `
      <div class="stat-card">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <div class="stat-card-label">${label}</div>
            <div class="stat-card-value">${value}</div>
            ${change !== undefined ? `<div class="stat-card-change ${changeClass}">${changeIcon} ${Math.abs(change)}%</div>` : ''}
          </div>
          ${icon ? `<span style="font-size:24px;opacity:0.6">${icon}</span>` : ''}
        </div>
      </div>
    `;
  },

  // Recommendation Card
  recommendationCard(rec) {
    const priorityColors = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--info)' };
    const priorityLabels = { high: '高', medium: '中', low: '低' };
    const typeIcons = CONFIG.ACTION_TYPES.reduce((m, t) => { m[t.id] = t.icon; return m; }, {});

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:20px">${typeIcons[rec.category] || '📋'}</span>
            <div>
              <div class="card-title">${rec.title}</div>
              <div style="display:flex;gap:6px;margin-top:4px">
                <span class="tag" style="background:${priorityColors[rec.priority]}22;color:${priorityColors[rec.priority]}">
                  優先度: ${priorityLabels[rec.priority]}
                </span>
                ${rec.evidence ? `<span class="tag tag-accent">エビデンス: ${rec.evidence}</span>` : ''}
              </div>
            </div>
          </div>
          ${rec.cost ? `<span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent)">${rec.cost}</span>` : ''}
        </div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:14px">${rec.description}</p>
          ${rec.action ? this.actionButtons(rec.action) : ''}
        </div>
      </div>
    `;
  },

  // Action Buttons for recommendations
  actionButtons(action) {
    let html = '<div style="display:flex;flex-wrap:wrap;gap:8px">';

    if (action.type === 'supplement' && action.links) {
      action.links.forEach(link => {
        const affUrl = affiliateEngine.generateLink(link, affiliateEngine.detectStore(link.url));
        html += `<a href="${affUrl}" target="_blank" rel="noopener"
          class="btn btn-sm btn-primary"
          onclick="affiliateEngine.trackClick('${action.product}','${affiliateEngine.detectStore(link.url)}','purchase')">
          🛒 ${link.store} ${link.price || ''}
        </a>`;
      });
    }

    if (action.type === 'clinic' && action.facilities) {
      action.facilities.forEach(f => {
        html += `<a href="${f.url || '#'}" target="_blank" rel="noopener" class="btn btn-sm btn-outline">
          🏥 ${f.name}（${f.area}）
        </a>`;
      });
    }

    if (action.type === 'device' && action.links) {
      action.links.forEach(link => {
        const affUrl = affiliateEngine.generateLink(link, affiliateEngine.detectStore(link.url));
        html += `<a href="${affUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-success"
          onclick="affiliateEngine.trackClick('${action.product}','${affiliateEngine.detectStore(link.url)}','purchase')">
          🔧 ${link.store} ${link.price || ''}
        </a>`;
      });
    }

    if (action.type === 'clinical_trial') {
      html += `<a href="${action.url || '#'}" target="_blank" rel="noopener" class="btn btn-sm btn-warning">
        🧪 臨床試験の詳細を見る
      </a>`;
    }

    html += '</div>';
    return html;
  },

  // Research Update Card
  researchCard(research) {
    const sigColors = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--info)' };
    // Build valid links
    const doiUrl = research.doi && research.doi.startsWith('10.') ? `https://doi.org/${research.doi}` : '';
    const pubmedSearchUrl = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(research.title.substring(0, 100))}`;
    const sourceUrl = research.url || doiUrl || pubmedSearchUrl;
    const translateUrl = sourceUrl ? `https://translate.google.com/translate?sl=en&tl=ja&u=${encodeURIComponent(sourceUrl)}` : '';

    return `
      <div class="card" style="margin-bottom:12px">
        <div class="card-body" style="padding:16px 20px">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
            <div class="tag" style="background:${sigColors[research.significance]}22;color:${sigColors[research.significance]}">
              ${research.significance === 'high' ? '重要' : research.significance === 'medium' ? '注目' : '参考'}
            </div>
            <span style="font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace">${research.date}</span>
          </div>
          <h4 style="font-size:14px;font-weight:600;margin-bottom:6px;line-height:1.5">${research.title}</h4>
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${research.authors} — ${research.journal}</p>
          <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:10px">${research.summary}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a href="${pubmedSearchUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-outline">PubMedで検索</a>
            ${translateUrl ? `<a href="${translateUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-primary">日本語で読む</a>` : ''}
            ${doiUrl ? `<a href="${doiUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">論文全文（DOI）</a>` : ''}
            ${doiUrl ? `<a href="https://translate.google.com/translate?sl=en&tl=ja&u=${encodeURIComponent(doiUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline">論文全文（日本語）</a>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  // Data Entry Form
  dataEntryForm(category) {
    const cat = CONFIG.DATA_CATEGORIES.find(c => c.id === category);
    if (!cat) return '';

    const fieldRenderers = {
      fatigue_level: () => this.sliderField('fatigue_level', '疲労度', 0, 7),
      pain_level: () => this.sliderField('pain_level', '痛みレベル', 0, 7),
      brain_fog: () => this.sliderField('brain_fog', 'ブレインフォグ', 0, 7),
      sleep_quality: () => this.sliderField('sleep_quality', '睡眠品質', 0, 7),
      pem_status: () => this.toggleField('pem_status', 'PEM（労作後倦怠感）'),
      heart_rate: () => this.numberField('heart_rate', '心拍数', 'bpm', 40, 200),
      blood_pressure: () => this.bpField(),
      temperature: () => this.numberField('temperature', '体温', '°C', 34, 42, 0.1),
      spo2: () => this.numberField('spo2', 'SpO2', '%', 80, 100),
      condition_level: () => `
        <div class="form-group">
          <label class="form-label">今日の体調 <span id="val-condition_level">5</span>/10</label>
          <input type="range" name="condition_level" min="1" max="10" value="5"
            style="width:100%;accent-color:var(--accent)"
            oninput="document.getElementById('val-condition_level').textContent=this.value">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px">
            <span>最悪</span><span>絶好調</span>
          </div>
        </div>`,
      mood: () => `
        <div class="form-group">
          <label class="form-label">気分 <span id="val-mood">5</span>/10</label>
          <input type="range" name="mood" min="1" max="10" value="5"
            style="width:100%;accent-color:var(--accent)"
            oninput="document.getElementById('val-mood').textContent=this.value">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px">
            <span>落ち込み</span><span>最高</span>
          </div>
        </div>`,
      steps: () => this.numberField('steps', '歩数', '歩', 0, 50000),
      duration: () => this.numberField('duration', '睡眠時間', '時間', 0, 24, 0.5),
      meals: () => this.textField('meals', '食事内容'),
      medications: () => this.textField('medications', '薬の名前'),
      dosage: () => this.textField('dosage', '用量・飲み方'),
    };

    let fields = '';
    cat.fields.forEach(f => {
      if (fieldRenderers[f]) {
        fields += fieldRenderers[f]();
      } else {
        fields += this.textField(f, f.replace(/_/g, ' '));
      }
    });

    return `
      <form id="data-form-${category}" onsubmit="app.submitDataForm(event, '${category}')">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:16px">${cat.icon} ${cat.name}</h3>
        ${fields}
        <div style="display:flex;gap:10px;margin-top:20px">
          <button type="submit" class="btn btn-primary">保存</button>
          <button type="button" class="btn btn-secondary" onclick="app.closeModal()">キャンセル</button>
        </div>
      </form>
    `;
  },

  sliderField(name, label, min, max) {
    return `
      <div class="form-group">
        <label class="form-label">${label}: <span id="val-${name}">${Math.floor((max-min)/2)}</span></label>
        <input type="range" name="${name}" min="${min}" max="${max}" value="${Math.floor((max-min)/2)}"
          style="width:100%;accent-color:var(--accent)"
          oninput="document.getElementById('val-${name}').textContent=this.value">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px">
          <span>${CONFIG.SEVERITY_LEVELS[min]?.label || min}</span>
          <span>${CONFIG.SEVERITY_LEVELS[max]?.label || max}</span>
        </div>
      </div>
    `;
  },

  numberField(name, label, unit, min, max, step = 1) {
    return `
      <div class="form-group">
        <label class="form-label">${label}</label>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="number" name="${name}" min="${min}" max="${max}" step="${step}"
            class="form-input" style="width:120px" placeholder="--">
          <span style="font-size:12px;color:var(--text-muted)">${unit}</span>
        </div>
      </div>
    `;
  },

  textField(name, label) {
    return `
      <div class="form-group">
        <label class="form-label">${label}</label>
        <input type="text" name="${name}" class="form-input" placeholder="${label}を入力...">
      </div>
    `;
  },

  toggleField(name, label) {
    return `
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
          <input type="checkbox" name="${name}" style="width:18px;height:18px;accent-color:var(--accent)">
          <span style="font-size:13px">${label}</span>
        </label>
      </div>
    `;
  },

  bpField() {
    return `
      <div class="form-group">
        <label class="form-label">血圧</label>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="number" name="bp_systolic" class="form-input" style="width:80px" placeholder="収縮期" min="60" max="250">
          <span style="color:var(--text-muted)">/</span>
          <input type="number" name="bp_diastolic" class="form-input" style="width:80px" placeholder="拡張期" min="30" max="150">
          <span style="font-size:12px;color:var(--text-muted)">mmHg</span>
        </div>
      </div>
    `;
  },

  // Photo Upload Component
  photoUpload(category) {
    return `
      <div class="upload-area" onclick="document.getElementById('photo-input-${category}').click()"
           ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
           ondragleave="this.style.borderColor='var(--border)'"
           ondrop="app.handlePhotoDrop(event, '${category}')">
        <div class="upload-area-icon">📸</div>
        <div class="upload-area-text">クリックまたはドラッグ&ドロップ</div>
        <div class="upload-area-hint">写真・画像・PDF・CSV・JSON・XML・テキスト</div>
        <input type="file" id="photo-input-${category}" hidden multiple
          accept="image/*,.pdf,.csv,.json,.xml,.txt,.xlsx" onchange="app.handlePhotoUpload(event, '${category}')">
      </div>
      <div id="photo-preview-${category}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;margin-top:12px"></div>
    `;
  },

  // Chat Message
  chatMessage(msg) {
    const isUser = msg.role === 'user';
    return `
      <div class="chat-message ${isUser ? 'user' : 'ai'}">
        ${!isUser ? '<div class="user-avatar" style="width:28px;height:28px;font-size:12px">AI</div>' : ''}
        <div class="chat-bubble">${this.formatMarkdown(msg.content)}</div>
      </div>
    `;
  },

  // Simple markdown formatter (with URL auto-linking)
  formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
      // URL auto-linking: convert URLs to clickable <a> tags
      .replace(/(https?:\/\/[^\s<>"'`\]\)]+)/g, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;word-break:break-all">${url}</a>`;
      })
      .replace(/\n/g, '<br>');
  },

  // Toast notification
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container') || (() => {
      const c = document.createElement('div');
      c.id = 'toast-container';
      c.className = 'toast-container';
      document.body.appendChild(c);
      return c;
    })();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  // Loading spinner
  loading(text = '分析中...') {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px">
        <div class="spinner" style="width:40px;height:40px;border-width:4px;margin-bottom:16px"></div>
        <span style="font-size:14px;color:var(--text-secondary)">${text}</span>
      </div>
    `;
  },

  // Empty state
  emptyState(icon, title, description) {
    return `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:48px;margin-bottom:16px;opacity:0.5">${icon}</div>
        <h3 style="font-size:16px;font-weight:600;margin-bottom:8px">${title}</h3>
        <p style="font-size:13px;color:var(--text-secondary);max-width:400px;margin:0 auto">${description}</p>
      </div>
    `;
  }
};
