(() => {
  const $ = id => document.getElementById(id);
  let requesting = false, busy = false;
  const notice = message => { $('directPostStatus').textContent = message; };
  function controls() {
    $('warehouseDistributeBtn').disabled = requesting || busy;
    $('warehouseDistributeBtn').textContent = requesting || busy ? 'Đang đăng video…' : 'Đăng video';
    document.querySelectorAll('#tiktokAccountsContainer button, #tiktokAccountsContainer input, #tiktokAddAccountBtn, #tiktokRefreshBtn').forEach(el => { el.disabled = requesting || busy; });
  }
  async function refresh() {
    try {
      const response = await fetch('/api/tiktok/warehouse/status');
      if (!response.ok) throw new Error('Không đọc được trạng thái đăng.');
      const state = await response.json(); busy = state.busy;
      if (!requesting) notice(state.message);
      $('directPostLogs').textContent = state.logs.join('\n');
    } catch (error) { notice(error.message); }
    controls();
  }
  $('warehouseDistributeBtn').addEventListener('click', async () => {
    if (requesting || busy) return;
    const accountIds = [...document.querySelectorAll('.tiktok-account-card.selected')].map(el => el.dataset.id);
    const folderPath = $('warehouseFolderPath').value.trim();
    if (!accountIds.length || !folderPath) { notice('Chọn kênh TikTok và thư mục video trước khi đăng.'); return; }
    requesting = true; controls(); notice('Đang bắt đầu đăng video…');
    try {
      const response = await fetch('/api/tiktok/warehouse/distribute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountIds, folderPath, captionPrompt: $('tiktokCaptionPrompt').value, extraHashtags: $('tiktokHashtags').value, geminiApiKey: $('geminiApiKey').value, geminiModel: $('geminiModel')?.value, channelDelaySeconds: $('tiktokChannelDelay').value }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Không thể bắt đầu đăng.');
      busy = true;
      requesting = false;
      await refresh();
    } catch (error) { notice(error.message); }
    finally { requesting = false; controls(); }
  });
  document.querySelector('.tiktok-section')?.classList.remove('is-collapsed');
  async function poll() { await refresh(); setTimeout(poll, 2000); }
  poll();
})();