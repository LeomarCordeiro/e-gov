export async function documentStyles(fetcher=fetch) {
  const response=await fetcher('/styles.css');
  if(!response.ok)throw new Error('Não foi possível preparar o estilo dos documentos.');
  return (await response.text()).replace(/@font-face\{[^}]*\}/g,'');
}

export async function standaloneDocument(html,fetcher=fetch) {
  const css=await documentStyles(fetcher);
  return html.replace(/<link rel="stylesheet"[^>]*>/,()=>`<style>${css}</style>`);
}
