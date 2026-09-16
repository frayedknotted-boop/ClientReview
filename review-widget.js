/**
 * VideoReviewWidget — Drop-in timestamped video review tool
 * No dependencies. One file. Works inside any page.
 *
 * Usage (legacy — hardcoded values):
 *   ReviewWidget.init({
 *     container: '#video-review-widget',
 *     video: 'videos/my_video.mp4',
 *     fps: 24,
 *     project: 'Project Name',
 *     client: 'Client Name'
 *   });
 *
 * Usage (JSON load — editor sends a Client Review JSON):
 *   ReviewWidget.init({
 *     container: '#video-review-widget'
 *   });
 */

const ReviewWidget = (() => {

  // ─── state ──────────────────────────────────────────────────────────
  let video = null;
  let fps = 24;
  let projectName = '';
  let clientName = '';
  let videoSrc = '';
  let comments = [];
  let commentIdCounter = 0;
  let progressBar = null;
  let progressFilled = null;
  let dotLayer = null;
  let timecodeDisplay = null;
  let commentList = null;
  let commentInput = null;
  let commentInputWrap = null;
  let pendingTimecode = null;
  let pendingFrame = null;
  let containerEl = null;

  // config round-trip fields (carried from editor's JSON → client export)
  let configTimeline = '';
  let configInFrame = null;
  let configOutFrame = null;
  let configInTC = '';
  let configOutTC = '';
  let configObservations = '';
  let configCommentsToClient = '';

  // ─── helpers ────────────────────────────────────────────────────────

  function secsToTC(totalSecs) {
    const secs = Math.floor(totalSecs);
    const f = Math.floor((totalSecs - secs) * fps);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s) + ':' + pad(f);
  }

  function secsToFrame(totalSecs) {
    return Math.floor(totalSecs * fps);
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'className') e.className = attrs[k];
        else if (k === 'textContent') e.textContent = attrs[k];
        else if (k === 'innerHTML') e.innerHTML = attrs[k];
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      children.forEach(c => {
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else if (c) e.appendChild(c);
      });
    }
    return e;
  }

  // ─── styles (scoped via .vrw- prefix) ───────────────────────────────

  function injectStyles() {
    if (document.getElementById('vrw-styles')) return;
    const css = `
      .vrw-root {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #e0e0e0;
        background: #1a1a1a;
        border-radius: 8px;
        overflow: hidden;
        max-width: 960px;
        margin: 0 auto;
      }

      .vrw-root * { box-sizing: border-box; }

      /* ── drop zone / load screen ── */
      .vrw-dropzone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 300px;
        padding: 40px 20px;
        text-align: center;
      }
      .vrw-dropzone-icon {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.7;
      }
      .vrw-dropzone-title {
        font-size: 18px;
        font-weight: 600;
        color: #e0e0e0;
        margin-bottom: 8px;
      }
      .vrw-dropzone-subtitle {
        font-size: 14px;
        color: #888;
        margin-bottom: 20px;
      }
      .vrw-dropzone-or {
        font-size: 13px;
        color: #666;
        margin: 12px 0;
      }
      .vrw-dropzone.vrw-dragover {
        background: #1a3a5c;
        outline: 2px dashed #2b7de9;
        outline-offset: -8px;
      }
      .vrw-root.vrw-dragover {
        outline: 2px dashed #2b7de9;
        outline-offset: -4px;
      }

      /* ── editor message panel ── */
      .vrw-editor-message {
        background: #252530;
        border-left: 3px solid #2b7de9;
        padding: 10px 14px;
        margin: 0;
        font-size: 13px;
        color: #bbb;
        max-height: 150px;
        overflow-y: auto;
      }
      .vrw-editor-message-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #2b7de9;
        margin-bottom: 4px;
        font-weight: 600;
      }
      .vrw-editor-message-text {
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* ── video ── */
      .vrw-video-wrap {
        position: relative;
        background: #000;
        line-height: 0;
      }
      .vrw-video-wrap video {
        width: 100%;
        display: block;
      }

      /* ── progress bar ── */
      .vrw-progress-wrap {
        position: relative;
        height: 24px;
        background: #333;
        cursor: pointer;
        user-select: none;
      }
      .vrw-progress-filled {
        height: 100%;
        background: #2b7de9;
        width: 0%;
        pointer-events: none;
        position: absolute;
        top: 0; left: 0;
      }
      .vrw-dot-layer {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        pointer-events: none;
      }
      .vrw-dot {
        position: absolute;
        top: 3px;
        width: 8px;
        height: 18px;
        background: #FFD700;
        border-radius: 2px;
        transform: translateX(-50%);
        pointer-events: all;
        cursor: pointer;
        opacity: 0.85;
        transition: opacity 0.15s;
      }
      .vrw-dot:hover {
        opacity: 1;
        background: #fff;
      }

      /* ── controls ── */
      .vrw-controls {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: #222;
        flex-wrap: wrap;
      }
      .vrw-btn {
        background: #2b7de9;
        color: #fff;
        border: none;
        padding: 7px 14px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
      }
      .vrw-btn:hover { background: #1a6ad4; }
      .vrw-btn-secondary {
        background: #444;
      }
      .vrw-btn-secondary:hover { background: #555; }
      .vrw-btn-comment {
        background: #e6a817;
        color: #000;
      }
      .vrw-btn-comment:hover { background: #f5be2e; }
      .vrw-timecode {
        font-family: "SF Mono", "Consolas", "Courier New", monospace;
        font-size: 14px;
        color: #ccc;
        padding: 0 8px;
        min-width: 110px;
        text-align: center;
      }
      .vrw-spacer { flex: 1; }

      /* ── comment input ── */
      .vrw-comment-input-wrap {
        display: none;
        padding: 10px 12px;
        background: #292929;
        border-top: 1px solid #333;
      }
      .vrw-comment-input-wrap.vrw-active { display: block; }
      .vrw-comment-input-header {
        font-size: 13px;
        color: #FFD700;
        margin-bottom: 6px;
      }
      .vrw-comment-textarea {
        width: 100%;
        min-height: 60px;
        padding: 8px;
        background: #d0d0d0;
        color: #000;
        border: 1px solid #555;
        border-radius: 4px;
        font-family: inherit;
        font-size: 13px;
        resize: vertical;
      }
      .vrw-comment-textarea:focus {
        outline: none;
        border-color: #2b7de9;
      }
      .vrw-comment-submit-row {
        display: flex;
        gap: 6px;
        margin-top: 6px;
      }

      /* ── comment list ── */
      .vrw-comment-list {
        max-height: 320px;
        overflow-y: auto;
        padding: 0;
        margin: 0;
        list-style: none;
        background: #1e1e1e;
      }
      .vrw-comment-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border-bottom: 1px solid #2a2a2a;
        cursor: pointer;
        transition: background 0.15s;
      }
      .vrw-comment-item:hover { background: #292929; }
      .vrw-comment-item.vrw-active-comment { background: #1a3a5c; }
      .vrw-comment-tc {
        font-family: "SF Mono", "Consolas", "Courier New", monospace;
        font-size: 12px;
        color: #2b7de9;
        white-space: nowrap;
        min-width: 100px;
        padding-top: 2px;
      }
      .vrw-comment-text {
        font-size: 13px;
        color: #ccc;
        flex: 1;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .vrw-comment-actions {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
      }
      .vrw-comment-edit,
      .vrw-comment-delete {
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 14px;
        padding: 0 4px;
        line-height: 1;
      }
      .vrw-comment-edit:hover { color: #2b7de9; }
      .vrw-comment-delete:hover { color: #e55; }

      /* inline edit mode */
      .vrw-edit-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .vrw-edit-textarea {
        width: 100%;
        min-height: 50px;
        padding: 6px;
        background: #d0d0d0;
        color: #000;
        border: 1px solid #2b7de9;
        border-radius: 4px;
        font-family: inherit;
        font-size: 13px;
        resize: vertical;
      }
      .vrw-edit-textarea:focus {
        outline: none;
        border-color: #1a6ad4;
      }
      .vrw-edit-btns {
        display: flex;
        gap: 4px;
      }
      .vrw-edit-btns button {
        padding: 3px 10px;
        font-size: 12px;
        border-radius: 3px;
        border: none;
        cursor: pointer;
      }
      .vrw-edit-save {
        background: #2b7de9;
        color: #fff;
      }
      .vrw-edit-save:hover { background: #1a6ad4; }
      .vrw-edit-cancel {
        background: #444;
        color: #ccc;
      }
      .vrw-edit-cancel:hover { background: #555; }

      /* ── footer ── */
      .vrw-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #222;
        border-top: 1px solid #333;
        font-size: 12px;
        color: #888;
        flex-wrap: wrap;
        gap: 6px;
      }

      .vrw-footer-buttons {
        display: flex;
        gap: 6px;
      }

      /* ── empty state ── */
      .vrw-empty {
        padding: 20px 12px;
        text-align: center;
        color: #666;
        font-size: 13px;
        font-style: italic;
      }

      /* ── export confirmation ── */
      .vrw-export-confirm {
        padding: 10px 14px;
        background: #1a5c2a;
        color: #d0f0d0;
        font-size: 13px;
        text-align: center;
        transition: opacity 0.4s;
      }

      /* ── keyboard help ── */
      .vrw-keyboard-help {
        padding: 8px 12px;
        background: #252525;
        border-top: 1px solid #333;
        font-size: 12px;
        color: #777;
      }
      .vrw-keyboard-help strong {
        color: #aaa;
      }
      .vrw-kbd {
        display: inline-block;
        background: #3a3a3a;
        border: 1px solid #555;
        border-radius: 3px;
        padding: 1px 6px;
        font-family: inherit;
        font-size: 11px;
        color: #ccc;
        margin: 0 1px;
      }

      /* ── responsive ── */
      @media (max-width: 600px) {
        .vrw-controls { gap: 4px; padding: 6px 8px; }
        .vrw-btn { padding: 6px 10px; font-size: 12px; }
        .vrw-timecode { font-size: 12px; min-width: 90px; }
        .vrw-dropzone { min-height: 220px; padding: 24px 16px; }
        .vrw-dropzone-icon { font-size: 36px; }
      }
    `;
    const style = el('style', { id: 'vrw-styles' });
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── JSON load screen ──────────────────────────────────────────────

  function showLoadScreen() {
    const root = el('div', { className: 'vrw-root' });

    const dropzone = el('div', { className: 'vrw-dropzone' });

    dropzone.appendChild(el('div', { className: 'vrw-dropzone-icon', textContent: '📂' }));
    dropzone.appendChild(el('div', { className: 'vrw-dropzone-title', textContent: 'Load Review File' }));
    dropzone.appendChild(el('div', { className: 'vrw-dropzone-subtitle', textContent: 'Drag & drop the Client Review JSON file here' }));

    // file input (hidden)
    const fileInput = el('input', { type: 'file', accept: '.json' });
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        loadJSONFile(fileInput.files[0]);
      }
    });

    dropzone.appendChild(el('div', { className: 'vrw-dropzone-or', textContent: '— or —' }));
    dropzone.appendChild(el('button', {
      className: 'vrw-btn',
      textContent: 'Choose File…',
      onClick: () => fileInput.click()
    }));
    dropzone.appendChild(fileInput);

    // drag events
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('vrw-dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('vrw-dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('vrw-dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        loadJSONFile(e.dataTransfer.files[0]);
      }
    });

    root.appendChild(dropzone);
    containerEl.innerHTML = '';
    containerEl.appendChild(root);
  }

  function loadJSONFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.video) {
          alert('Invalid review file: no "video" field found.');
          return;
        }
        applyConfig(data);
        buildReviewUI();
      } catch (err) {
        alert('Could not read JSON file:\n' + err.message);
      }
    };
    reader.onerror = () => {
      alert('Error reading file.');
    };
    reader.readAsText(file);
  }

  function loadNewJSONWithWarning(file) {
    if (comments.length > 0) {
      const ok = confirm(
        'You have ' + comments.length + ' unsaved comment' +
        (comments.length === 1 ? '' : 's') +
        '.\n\nExport them first, or click OK to discard and load the new file.'
      );
      if (!ok) return;
    }
    comments = [];
    commentIdCounter = 0;
    loadJSONFile(file);
  }

  function openNewJSONPicker() {
    const input = el('input', { type: 'file', accept: '.json' });
    input.style.display = 'none';
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) {
        loadNewJSONWithWarning(input.files[0]);
      }
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }

  function applyConfig(data) {
    projectName = data.project || '';
    clientName = data.client || '';
    videoSrc = data.video || '';
    fps = data.fps || 24;
    configTimeline = data.timeline || '';
    configInFrame = data.inFrame != null ? data.inFrame : null;
    configOutFrame = data.outFrame != null ? data.outFrame : null;
    configInTC = data.inTC || '';
    configOutTC = data.outTC || '';
    configObservations = data.observations || '';
    configCommentsToClient = data.commentsToClient || '';
  }

  // ─── progress bar & dots ────────────────────────────────────────────

  function updateProgress() {
    if (!video || !video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    progressFilled.style.width = pct + '%';
    timecodeDisplay.textContent = secsToTC(video.currentTime);
    highlightActiveComment();
  }

  function seekFromClick(e) {
    const rect = progressBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pct * video.duration;
    updateProgress();
  }

  function renderDots() {
    dotLayer.innerHTML = '';
    if (!video || !video.duration) return;
    comments.forEach(c => {
      const pct = (c.seconds / video.duration) * 100;
      const dot = el('div', {
        className: 'vrw-dot',
        title: c.timecode + ' — ' + c.text.substring(0, 40),
        onClick: (e) => {
          e.stopPropagation();
          video.currentTime = c.seconds;
          video.pause();
          updateProgress();
        }
      });
      dot.style.left = pct + '%';
      dotLayer.appendChild(dot);
    });
  }

  // ─── comment list ───────────────────────────────────────────────────

  function enterEditMode(item, c) {
    if (item.querySelector('.vrw-edit-area')) return;

    const textSpan = item.querySelector('.vrw-comment-text');
    const actions = item.querySelector('.vrw-comment-actions');
    textSpan.style.display = 'none';
    actions.style.display = 'none';

    const textarea = el('textarea', { className: 'vrw-edit-textarea' });
    textarea.value = c.text;

    const saveBtn = el('button', { className: 'vrw-edit-save', textContent: 'Save' });
    const cancelBtn = el('button', { className: 'vrw-edit-cancel', textContent: 'Cancel' });

    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newText = textarea.value.trim();
      if (newText) {
        comments = comments.map(x => x.id === c.id ? { ...x, text: newText } : x);
      }
      renderComments();
      renderDots();
    });

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editArea.remove();
      textSpan.style.display = '';
      actions.style.display = '';
    });

    const editArea = el('div', { className: 'vrw-edit-area' }, [
      textarea,
      el('div', { className: 'vrw-edit-btns' }, [saveBtn, cancelBtn])
    ]);

    textSpan.parentNode.insertBefore(editArea, textSpan.nextSibling);
    textarea.focus();
    textarea.selectionStart = textarea.value.length;

    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveBtn.click();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    });
  }

  function renderComments() {
    commentList.innerHTML = '';
    if (comments.length === 0) {
      commentList.appendChild(el('li', {
        className: 'vrw-empty',
        textContent: 'No comments yet — pause the video and click "Add Comment" to begin.'
      }));
      return;
    }

    const sorted = [...comments].sort((a, b) => a.seconds - b.seconds);
    sorted.forEach(c => {
      const textSpan = el('span', { className: 'vrw-comment-text', textContent: c.text });
      const editBtn = el('button', {
        className: 'vrw-comment-edit',
        title: 'Edit comment',
        textContent: 'Edit',
      });
      const deleteBtn = el('button', {
        className: 'vrw-comment-delete',
        title: 'Delete comment',
        textContent: '✕',
      });
      const actions = el('div', { className: 'vrw-comment-actions' }, [editBtn, deleteBtn]);

      const item = el('li', {
        className: 'vrw-comment-item',
        'data-id': c.id,
      }, [
        el('span', { className: 'vrw-comment-tc', textContent: c.timecode }),
        textSpan,
        actions
      ]);

      item.addEventListener('click', () => {
        video.currentTime = c.seconds;
        video.pause();
        updateProgress();
      });

      textSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        enterEditMode(item, c);
      });

      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        enterEditMode(item, c);
      });

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        comments = comments.filter(x => x.id !== c.id);
        renderComments();
        renderDots();
      });

      commentList.appendChild(item);
    });

    renderDots();
  }

  function highlightActiveComment() {
    if (!video) return;
    const items = commentList.querySelectorAll('.vrw-comment-item');
    const cur = video.currentTime;
    let closest = null;
    let closestDist = Infinity;
    comments.forEach(c => {
      const d = Math.abs(c.seconds - cur);
      if (d < closestDist && d < 1) {
        closestDist = d;
        closest = c.id;
      }
    });
    items.forEach(item => {
      if (item.getAttribute('data-id') == closest) {
        item.classList.add('vrw-active-comment');
      } else {
        item.classList.remove('vrw-active-comment');
      }
    });
  }

  // ─── comment input ──────────────────────────────────────────────────

  function openCommentInput() {
    video.pause();
    pendingTimecode = secsToTC(video.currentTime);
    pendingFrame = secsToFrame(video.currentTime);
    commentInputWrap.classList.add('vrw-active');
    commentInputWrap.querySelector('.vrw-comment-input-header').textContent =
      'Comment at ' + pendingTimecode + '  (frame ' + pendingFrame + ')';
    commentInput.value = '';
    commentInput.focus();
  }

  function submitComment() {
    const text = commentInput.value.trim();
    if (!text) return;
    comments.push({
      id: ++commentIdCounter,
      timecode: pendingTimecode,
      frame: pendingFrame,
      seconds: video.currentTime,
      text: text
    });
    commentInputWrap.classList.remove('vrw-active');
    commentInput.value = '';
    renderComments();
  }

  function cancelComment() {
    commentInputWrap.classList.remove('vrw-active');
    commentInput.value = '';
  }

  // ─── step controls ─────────────────────────────────────────────────

  function stepBack() {
    video.currentTime = Math.max(0, video.currentTime - (1 / fps));
    video.pause();
    updateProgress();
  }

  function stepForward() {
    video.currentTime = Math.min(video.duration, video.currentTime + (1 / fps));
    video.pause();
    updateProgress();
  }

  function prevComment() {
    if (!comments.length) return;
    const sorted = [...comments].sort((a, b) => a.seconds - b.seconds);
    const cur = video.currentTime - 0.1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].seconds < cur) {
        video.currentTime = sorted[i].seconds;
        video.pause();
        updateProgress();
        return;
      }
    }
    video.currentTime = sorted[sorted.length - 1].seconds;
    video.pause();
    updateProgress();
  }

  function nextComment() {
    if (!comments.length) return;
    const sorted = [...comments].sort((a, b) => a.seconds - b.seconds);
    const cur = video.currentTime + 0.1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].seconds > cur) {
        video.currentTime = sorted[i].seconds;
        video.pause();
        updateProgress();
        return;
      }
    }
    video.currentTime = sorted[0].seconds;
    video.pause();
    updateProgress();
  }

  // ─── export ─────────────────────────────────────────────────────────

  function exportJSON() {
    if (!comments.length) return;

    // prompt for filename
    const defaultName = (projectName || 'review').replace(/\s+/g, '_') + '_comments';
    const userInput = prompt('Save comments as:', defaultName);
    if (!userInput) return; // cancelled

    // ensure .json extension
    const fileName = userInput.endsWith('.json') ? userInput : userInput + '.json';

    const sorted = [...comments].sort((a, b) => a.seconds - b.seconds);
    const output = {
      project: projectName,
      client: clientName,
      timeline: configTimeline,
      video: videoSrc,
      fps: fps,
      inFrame: configInFrame,
      outFrame: configOutFrame,
      inTC: configInTC,
      outTC: configOutTC,
      observations: configObservations,
      exportDate: new Date().toISOString(),
      comments: sorted.map(c => ({
        timecode: c.timecode,
        frame: c.frame,
        seconds: Math.round(c.seconds * 1000) / 1000,
        comment: c.text
      }))
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // confirmation
    showExportConfirm(fileName);
  }

  function showExportConfirm(fileName) {
    // find the root element and show a temporary banner
    const root = containerEl.querySelector('.vrw-root');
    if (!root) return;
    const banner = el('div', {
      className: 'vrw-export-confirm',
      textContent: 'Exported as ' + fileName + ' — check your Downloads folder'
    });
    root.appendChild(banner);
    setTimeout(() => {
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 400);
    }, 4000);
  }

  // ─── keyboard shortcuts ─────────────────────────────────────────────

  function handleKeys(e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        video.paused ? video.play() : video.pause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        stepBack();
        break;
      case 'ArrowRight':
        e.preventDefault();
        stepForward();
        break;
      case 'c':
      case 'C':
        e.preventDefault();
        openCommentInput();
        break;
    }
  }

  // ─── build the review interface ────────────────────────────────────

  function buildReviewUI() {
    const root = el('div', { className: 'vrw-root' });

    // editor message panel (if commentsToClient is present)
    if (configCommentsToClient) {
      const msgPanel = el('div', { className: 'vrw-editor-message' }, [
        el('div', { className: 'vrw-editor-message-label', textContent: 'Message from editor' }),
        el('div', { className: 'vrw-editor-message-text', textContent: configCommentsToClient })
      ]);
      root.appendChild(msgPanel);
    }

    // video
    const videoWrap = el('div', { className: 'vrw-video-wrap' });
    video = el('video', { src: videoSrc, preload: 'metadata', playsinline: '', 'webkit-playsinline': '' });
    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('loadedmetadata', () => {
      updateProgress();
      renderDots();
    });
    videoWrap.appendChild(video);
    root.appendChild(videoWrap);

    // progress bar
    progressBar = el('div', { className: 'vrw-progress-wrap', onClick: seekFromClick });
    progressFilled = el('div', { className: 'vrw-progress-filled' });
    dotLayer = el('div', { className: 'vrw-dot-layer' });
    progressBar.appendChild(progressFilled);
    progressBar.appendChild(dotLayer);

    let dragging = false;
    progressBar.addEventListener('mousedown', (e) => { dragging = true; seekFromClick(e); });
    document.addEventListener('mousemove', (e) => { if (dragging) seekFromClick(e); });
    document.addEventListener('mouseup', () => { dragging = false; });

    root.appendChild(progressBar);

    // controls
    timecodeDisplay = el('span', { className: 'vrw-timecode', textContent: '00:00:00:00' });
    const controls = el('div', { className: 'vrw-controls' }, [
      el('button', { className: 'vrw-btn', textContent: '⏵ Play', onClick: () => video.play() }),
      el('button', { className: 'vrw-btn', textContent: '⏸ Pause', onClick: () => video.pause() }),
      el('button', { className: 'vrw-btn vrw-btn-secondary', textContent: '◂ Frame', onClick: stepBack }),
      el('button', { className: 'vrw-btn vrw-btn-secondary', textContent: 'Frame ▸', onClick: stepForward }),
      timecodeDisplay,
      el('span', { className: 'vrw-spacer' }),
      el('button', { className: 'vrw-btn vrw-btn-secondary', textContent: '⏮ Prev', title: 'Previous comment', onClick: prevComment }),
      el('button', { className: 'vrw-btn vrw-btn-secondary', textContent: 'Next ⏭', title: 'Next comment', onClick: nextComment }),
      el('button', { className: 'vrw-btn vrw-btn-comment', textContent: '✚ Add Comment', onClick: openCommentInput }),
    ]);
    root.appendChild(controls);

    // comment input area (hidden until needed)
    commentInputWrap = el('div', { className: 'vrw-comment-input-wrap' });
    const commentHeader = el('div', { className: 'vrw-comment-input-header', textContent: '' });
    commentInput = el('textarea', {
      className: 'vrw-comment-textarea',
      placeholder: 'Type your comment here...'
    });
    commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitComment();
      }
      if (e.key === 'Escape') cancelComment();
    });
    const submitRow = el('div', { className: 'vrw-comment-submit-row' }, [
      el('button', { className: 'vrw-btn', textContent: 'Save Comment (Ctrl+Enter)', onClick: submitComment }),
      el('button', { className: 'vrw-btn vrw-btn-secondary', textContent: 'Cancel', onClick: cancelComment }),
    ]);
    commentInputWrap.appendChild(commentHeader);
    commentInputWrap.appendChild(commentInput);
    commentInputWrap.appendChild(submitRow);
    root.appendChild(commentInputWrap);

    // comment list
    commentList = el('ul', { className: 'vrw-comment-list' });
    root.appendChild(commentList);
    renderComments();

    // keyboard help
    const kbHelp = el('div', { className: 'vrw-keyboard-help' });
    kbHelp.innerHTML = '<strong>Keyboard shortcuts:</strong> ' +
      '<span class="vrw-kbd">Space</span> Play/Pause &nbsp; ' +
      '<span class="vrw-kbd">←</span> Step back one frame &nbsp; ' +
      '<span class="vrw-kbd">→</span> Step forward one frame &nbsp; ' +
      '<span class="vrw-kbd">C</span> Add comment';
    root.appendChild(kbHelp);

    // footer
    const info = [projectName, clientName].filter(Boolean).join(' — ') || 'Video Review';
    const footer = el('div', { className: 'vrw-footer' }, [
      el('span', { textContent: info }),
      el('span', { className: 'vrw-footer-buttons' }, [
        el('button', {
          className: 'vrw-btn vrw-btn-secondary',
          textContent: '📂 Open New',
          title: 'Load a different review JSON',
          onClick: openNewJSONPicker
        }),
        el('button', {
          className: 'vrw-btn',
          textContent: '⬇ Export Comments (JSON)',
          onClick: exportJSON
        })
      ])
    ]);
    root.appendChild(footer);

    // drag & drop JSON onto the review UI
    root.addEventListener('dragover', (e) => {
      e.preventDefault();
      root.classList.add('vrw-dragover');
    });
    root.addEventListener('dragleave', (e) => {
      if (!root.contains(e.relatedTarget)) {
        root.classList.remove('vrw-dragover');
      }
    });
    root.addEventListener('drop', (e) => {
      e.preventDefault();
      root.classList.remove('vrw-dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith('.json')) {
          loadNewJSONWithWarning(file);
        }
      }
    });

    // keyboard
    document.addEventListener('keydown', handleKeys);

    // mount
    containerEl.innerHTML = '';
    containerEl.appendChild(root);
  }

  // ─── init ──────────────────────────────────────────────────────────

  function init(opts) {
    injectStyles();

    containerEl = typeof opts.container === 'string'
      ? document.querySelector(opts.container)
      : opts.container;

    if (!containerEl) {
      console.error('ReviewWidget: container not found');
      return;
    }

    // Legacy mode: if video is provided directly, skip load screen
    if (opts.video) {
      fps = opts.fps || 24;
      projectName = opts.project || '';
      clientName = opts.client || '';
      videoSrc = opts.video;
      buildReviewUI();
      return;
    }

    // JSON-load mode: show drop zone
    showLoadScreen();
  }

  return { init };

})();
