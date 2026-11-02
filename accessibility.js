// Official integration: https://vlibras.gov.br/doc/widget/installation/webpageintegration.html
let loading;
export function enableLibras(status) {
  if (loading) return loading;
  status.textContent = 'Carregando VLibras…';
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.onload = () => {
      let attempts = 0;
      const ready = setInterval(() => {
        if (window.VLibrasWidget?.initBtn) {
          clearInterval(ready);
          document.querySelector('#libras-launch').hidden = true;
          status.textContent = '';
          resolve();
        } else if (++attempts >= 100) {
          clearInterval(ready);
          status.textContent = 'O VLibras não terminou de iniciar. Recarregue a página para tentar novamente.';
          reject(new Error('Inicialização do VLibras incompleta'));
        }
      }, 200);
    };
    script.onerror = () => {
      script.remove();
      loading = undefined;
      status.textContent = 'Não foi possível carregar o VLibras. Confira a conexão e tente novamente.';
      reject(new Error('VLibras indisponível'));
    };
    document.head.append(script);
  });
  return loading;
}
