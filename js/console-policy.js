/*
 * Política de console da aplicação.
 * Mensagens de diagnóstico esperado ficam silenciosas em produção.
 * Warnings e errors continuam visíveis para facilitar a investigação.
 */
(() => {
  if (!window.console || window.console.__guardaConsolePolicy) return;

  const noop = () => {};
  window.console.log = noop;
  window.console.info = noop;
  window.console.debug = noop;
  window.console.__guardaConsolePolicy = true;
})();
