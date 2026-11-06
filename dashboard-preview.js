(() => {
  const toast = document.getElementById('toast');
  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2200);
  };
  document.getElementById('refreshButton')?.addEventListener('click', () => showToast('Atualização simulada concluída.'));
  document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.filter-button').forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
    const filter = button.dataset.filter;
    document.querySelectorAll('.record').forEach((record) => {
      record.hidden = filter !== 'all' && record.dataset.type !== filter;
    });
  }));
  document.querySelectorAll('.collapsed').forEach((block) => block.addEventListener('click', () => {
    block.classList.toggle('is-open');
    const label = block.querySelector('h3')?.textContent || 'Período';
    showToast(block.classList.contains('is-open') ? `${label}: detalhes disponíveis no app real.` : `${label} recolhido.`);
  }));
  document.querySelectorAll('.record-more,.attention-card button,.action').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    showToast('Ação demonstrativa: o protótipo não grava dados.');
  }));
})();
