(() => {
  const $ = id => document.getElementById(id);
  let requesting = false, busy = false;
  const notice = message => { $('directPostStatus').textContent = message; };
  function updateSelectionCount() {
    const cards = document.querySelectorAll('.tiktok-account-card');
    $('accountSelectionCount').textContent = `Đã chọn ${[...cards].filter(card => card.classList.contains('selected')).length} / ${cards.length} kênh`;
  }
  new MutationObserver(updateSelectionCount).observe($('tiktokAccountsContainer'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  for (const [id, selected] of [['selectAllAccounts', true], ['deselectAllAccounts', false]]) {
    $(id).addEventListener('click', async () => {
      if (busy || requesting) return;
      requesting = true; controls();
      try {
        const response = await fetch('/api/tiktok/accounts/select-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected }) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || 'Không lưu được lựa chọn.');
        document.querySelectorAll('.tiktok-account-card').forEach(card => { card.classList.toggle('selected', selected); card.querySelector('.tiktok-account-select').checked = selected; });
        updateSelectionCount();
      } catch (error) { notice(error.message); }
      finally { requesting = false; controls(); }
    });
  }
  function controls() {
    $('selectAllAccounts').disabled = $('deselectAllAccounts').disabled = requesting || busy;
    $('warehouseDistributeBtn').disabled = requesting || busy;
    $('warehouseDistributeBtn').textContent = requesting || busy ? 'Đang đăng video…' : 'Đăng video';
    document.querySelectorAll('#tiktokAccountsContainer button, #tiktokAccountsContainer input, #tiktokAddAccountBtn, #tiktokRefreshBtn').forEach(el => { el.disabled = requesting || busy; });
  }
  async function refresh() {
    try {
      const response = await fetch('/api/tiktok/warehouse/status');
      if (!response.ok) throw new Error('Không đọc được trạng thái đăng.');
      const state = await response.json(); const finished = busy && !state.busy; busy = state.busy;
      if (!requesting) notice(state.message);
      $('directPostLogs').textContent = state.logs.join('\n');
      if (finished) {
        await scanWarehouse();
        showPublishCompleteModal(state);
      }
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
  refreshTikTokHistoryCount().catch(() => {});
  async function poll() { await refresh(); setTimeout(poll, 2000); }
  poll();
})();
