(() => {
  const $ = id => document.getElementById(id);
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const labels = { preview: 'Sẵn sàng • Chờ bắt đầu', running: 'Đang chạy', paused: 'Đã tạm dừng', attention: 'Cần kiểm tra', completed: 'Đã hoàn tất', cancelled: 'Đã hủy', queued: 'Chờ đăng', uploading: 'Đang tải video', submitting: 'Đang gửi bài', submitted: 'Đã gửi bài', verifying: 'Đang xác minh', success: 'Đã công khai', processing: 'TikTok đang xử lý', needs_review: 'Cần đối soát', needs_action: 'Cần thao tác', failed: 'Chưa gửi • Có lỗi' };
  const attention = ['needs_review', 'needs_action', 'failed'];
  let runs = [], activeId = '', busy = false, preparing = false, requesting = false, currentChecks = null;
  const notice = (text, error = false) => { $('pubNotice').textContent = text; $('pubNotice').classList.toggle('hidden', !text); $('pubNotice').classList.toggle('error', error); };
  async function api(url, body) {
    const response = await fetch(`/api/tiktok/runs${url}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok && !data.checks) throw new Error(data.message || 'Không thể kết nối máy chủ.');
    return data;
  }
  function render() {
    const run = runs.find(r => r.id === activeId), items = run?.items || [];
    $('pubTotal').textContent = items.length;
    const successes = items.filter(i => i.status === 'success').length;
    $('pubSuccess').textContent = successes;
    $('pubAttention').textContent = items.filter(i => attention.includes(i.status)).length;
    $('pubPending').textContent = items.filter(i => !attention.includes(i.status) && !['success', 'cancelled'].includes(i.status)).length;
    $('pubRunState').textContent = run ? `${labels[run.status] || run.status}${run.pauseRequested && run.status === 'running' ? ' • Đang chờ kênh hiện tại hoàn tất' : ''}` : 'Chưa có lượt đăng';
    $('pubProgress').max = items.length || 1; $('pubProgress').value = successes;
    $('pubProgressText').textContent = `${successes} / ${items.length} đã công khai`;
    const locked = busy || preparing || requesting;
    $('warehouseDistributeBtn').disabled = locked;
    $('warehouseDistributeBtn').textContent = preparing ? 'Đang tạo content AI…' : busy ? 'Đang đăng video…' : 'Đăng video';
    $('pubStart').disabled = locked || !items.some(i => i.status === 'queued');
    $('pubStart').hidden = locked || !items.some(i => i.status === 'queued');
    $('pubStart').textContent = 'Tiếp tục phần chưa gửi';
    $('pubPause').disabled = !run || run.status !== 'running' || !!run.pauseRequested || requesting;
    $('pubRetry').disabled = locked || !items.some(i => ['failed', 'needs_action'].includes(i.status));
    $('pubReconcile').disabled = locked || !items.some(i => ['needs_review', 'processing'].includes(i.status));
    $('pubCancel').disabled = locked || !items.some(i => ['queued', 'failed', 'needs_action'].includes(i.status));
    // Account/profile mutations must wait until the active publisher releases Chrome.
    document.querySelectorAll('#tiktokAccountsContainer button, #tiktokAccountsContainer input, #tiktokAddAccountBtn, #tiktokRefreshBtn').forEach(el => { el.disabled = locked; });
    const filter = $('pubFilter').value;
    const shown = items.filter(i => filter === 'all' || filter === 'attention' && attention.includes(i.status) || filter === 'success' && i.status === 'success' || filter === 'pending' && !attention.includes(i.status) && !['success', 'cancelled'].includes(i.status));
    const rowsHtml = shown.map(item => `<tr><td><strong>${escape(item.accountName)}</strong><small>${escape(item.accountUsername)}</small></td><td><strong class="video-name" title="${escape(item.video)}">${escape(item.video)}</strong><details><summary>Xem caption & hashtag</summary><p class="caption-copy">${escape(item.caption)}</p><p class="tags-copy">${escape(item.hashtags.join(' '))}</p></details></td><td><span class="run-badge ${escape(item.status)}">${escape(labels[item.status] || item.status)}</span><small>${item.attempts ? `Lần thực hiện ${item.attempts}` : 'Chưa gửi'}</small></td><td>${/^https:\/\/www\.tiktok\.com\/@[\w.-]+\/video\/\d+$/.test(item.postUrl || '') ? `<a href="${escape(item.postUrl)}" target="_blank" rel="noopener noreferrer">Mở bài đăng ↗</a>` : '<span class="muted">Chưa có liên kết</span>'}${item.error ? `<p class="row-error">${escape(item.error)}</p>` : ''}${item.events?.length ? `<details><summary>Nhật ký thao tác</summary><ol class="item-events">${item.events.map(event => `<li><time>${escape(new Date(event.at).toLocaleTimeString('vi-VN'))}</time> ${escape(labels[event.message] || event.message)}</li>`).join('')}</ol></details>` : ''}${item.status === 'needs_action' ? `<button type="button" class="secondary" data-login="${escape(item.accountId)}">Mở đăng nhập kênh</button>` : ''}</td></tr>`).join('');
    // Preserve expanded captions and focus during polling when data is unchanged.
    const html = rowsHtml || '<tr><td colspan="4"><div class="studio-empty"><span aria-hidden="true">▤</span><strong>' + (items.length ? 'Không có video trong bộ lọc này' : 'Sẵn sàng cho lượt đăng đầu tiên') + '</strong><p>Chọn kênh và kho video bên dưới, sau đó chọn “Đăng video”.</p></div></td></tr>';
    if ($('pubRows').dataset.rendered !== html) { $('pubRows').innerHTML = html; $('pubRows').dataset.rendered = html; }
    const checks = currentChecks || run?.checks || [];
    $('pubCheckSummary').textContent = checks.length ? `· ${checks.filter(c => c.status === 'pass').length}/${checks.length} đạt` : '';
    if (checks.length) $('pubChecks').innerHTML = checks.map(c => `<li class="check-${escape(c.status)}"><strong>${c.status === 'pass' ? 'Đạt' : c.status === 'error' ? 'Cần sửa' : 'Lưu ý'} · ${escape(c.label)}</strong><span>${escape(c.message)}</span></li>`).join('');
  }
  async function refresh() {
    try {
      const data = await api(''); runs = data.runs; busy = data.busy;
      if (!runs.some(r => r.id === activeId)) activeId = runs[0]?.id || '';
      const options = runs.map(r => `<option value="${r.id}">${escape(new Date(r.createdAt).toLocaleString('vi-VN'))} · ${r.items.length} video</option>`).join('') || '<option value="">Chưa có dữ liệu</option>';
      if ($('pubRunSelect').innerHTML !== options) $('pubRunSelect').innerHTML = options;
      $('pubRunSelect').value = activeId; render();
    } catch (err) { notice(`Không cập nhật được trạng thái: ${err.message}`, true); }
  }
  $('pubRunSelect').addEventListener('change', e => { activeId = e.target.value; currentChecks = null; notice(''); render(); });
  $('pubFilter').addEventListener('change', render);
  $('warehouseDistributeBtn').addEventListener('click', async () => {
    if (preparing || busy || requesting) return;
    const accountIds = [...document.querySelectorAll('.tiktok-account-card.selected')].map(c => c.dataset.id);
    const folderPath = $('warehouseFolderPath').value.trim();
    if (!folderPath || !accountIds.length) { notice('Chọn thư mục kho và ít nhất một kênh TikTok.', true); $('pubNotice').scrollIntoView({ block: 'center' }); return; }
    preparing = true; currentChecks = null; render();
    notice('Đang chọn video và tạo content AI theo prompt. Tool sẽ tự đăng công khai lên các kênh đã chọn.');
    $('pubNotice').scrollIntoView({ block: 'center' });
    try {
      const data = await api('/preview', { folderPath, accountIds, channelDelaySeconds: $('tiktokChannelDelay').value, captionPrompt: $('tiktokCaptionPrompt').value, extraHashtags: $('tiktokHashtags').value, geminiApiKey: $('geminiApiKey').value, geminiModel: $('geminiModel')?.value });
      currentChecks = data.checks;
      if (data.ok) {
        activeId = data.run.id;
        await api(`/${activeId}/start`, {});
        notice('Đã bắt đầu đăng video. Tool tự tải video, điền content AI và xác nhận bài công khai.');
      }
      else { notice('Chưa thể đăng video. Xem nguyên nhân bên dưới.', true); $('pubChecksDetails').open = true; }
    } catch (err) { notice(err.message, true); }
    finally { preparing = false; await refresh(); }
  });
  for (const [id, action] of Object.entries({ pubStart: 'start', pubPause: 'pause', pubRetry: 'retry', pubReconcile: 'reconcile', pubCancel: 'cancel' })) {
    $(id).addEventListener('click', async () => {
      requesting = true; render();
      try { await api(`/${activeId}/${action}`, {}); notice(action === 'pause' ? 'Sẽ dừng sau khi kênh hiện tại hoàn tất.' : action === 'reconcile' ? 'Chỉ kiểm tra bài đã gửi. Không tải video lên lại.' : 'Đã tiếp nhận thao tác. Trạng thái sẽ cập nhật tự động.'); }
      catch (err) { notice(err.message, true); }
      finally { requesting = false; await refresh(); }
    });
  }
  $('pubRows').addEventListener('click', async event => {
    const button = event.target.closest('[data-login]'); if (!button || busy) return;
    button.disabled = true;
    try {
      const response = await fetch(`/api/tiktok/accounts/${encodeURIComponent(button.dataset.login)}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json(); notice(data.message, !data.ok);
    } catch (err) { notice(err.message, true); }
    finally { button.disabled = false; }
  });
  // A compact SVG vocabulary replaces platform-dependent decorative emoji.
  const icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 9h8M8 13h8M8 17h4"/></svg>';
  document.querySelectorAll('.section-head h2 > span:first-child, .preset-row + p > span, .tiktok-header-actions button > span:first-child, .tiktok-prompt-actions button > span:first-child, .history-head h3 > span:first-child').forEach(el => { el.innerHTML = icon; el.setAttribute('aria-hidden', 'true'); });
  $('themeToggle').textContent = 'Sáng / Tối';
  $('cleanupBtn').textContent = 'Dọn file tạm';
  // Keep publication configuration expanded on first visit even if old layouts collapsed it.
  document.querySelector('.tiktok-section')?.classList.remove('is-collapsed');
  refresh();
  async function poll() { await refresh(); setTimeout(poll, 2500); }
  setTimeout(poll, 2500);
})();
