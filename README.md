# Abraão Lins / Portfólio pessoal

Aplicação React com Vite, Tailwind CSS 4, Three.js, React Three Fiber e Drei. A lógica React, UI e shaders está unificada em `src/App.jsx`; estilos em `src/styles.css`.

A apresentação destaca nome, retrato, formação no IFRO e interesses em tecnologia e saúde. O terreno 3D funciona como fundo discreto. Os textos da interface estão em português, sem slogans de corrida ou habilidades inventadas.

## Executar

Requer Node.js 20.19+ ou 22.12+.

```sh
npm install
npm run dev
```

No PowerShell com scripts desabilitados, use `npm.cmd install` e `npm.cmd run dev`. Abra o endereço exibido pelo Vite. Para produção: `npm run build`. Para conferir o resultado: `npm run preview`. Publique a pasta `dist` em uma hospedagem estática. O HTML deve ser servido pelo Vite, não aberto por duplo clique.

## Cena e controles

- Terreno de 100 × 190 unidades, deformação contínua por `uTime` e normais calculadas no vertex shader. Material PBR com metalness 0.95 e roughness 0.1; wireframe sobreposto.
- Reflexos gerados localmente por Lightformers e Environment de 128 px capturado uma vez. Sem HDRI ou modelos externos.
- Luz direcional #ccff00 e PointLight traseira #ff5500. Turbo triplica as intensidades por um segundo e acelera o terreno e as partículas, com retorno suave da velocidade.
- 640 partículas em uma única chamada de desenho, com movimento calculado na GPU.
- Lerp independente da taxa de quadros, sem atualizações React dentro de useFrame. DPR limitado a 1.5 e geometria reduzida no celular ou sob queda de desempenho. Renderização pausada fora da primeira seção e em abas ocultas.
- Clique no fundo da seção inicial ou use o botão turbo, acessível por teclado. Links de navegação não ativam turbo. A preferência por movimento reduzido congela a cena e desativa o turbo.
- Retratos em `assets/abraao-principal.png` e `assets/abraao-studio.png`, editados a partir de fotos reais. Nenhum projeto, contato ou histórico esportivo fictício.

Fontes Inter e Syncopate via Google Fonts, com fallback local. Os arquivos `styles.css` e `script.js` na raiz pertencem à versão estática anterior e não são carregados pela aplicação.

Referências: [Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite), [renderização e performance do React Three Fiber](https://r3f.docs.pmnd.rs/advanced/pitfalls).
