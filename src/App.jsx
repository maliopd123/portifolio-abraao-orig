import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import portrait from '../assets/abraao-principal.png';
import aboutPortrait from '../assets/abraao-studio.png';
import './styles.css';

// Shared deformation keeps the PBR surface and wireframe perfectly aligned.
const terrainGLSL = `
  uniform float uTime;
  float terrain(vec2 p) {
    float travel = p.y - uTime * 8.0;
    float banks = smoothstep(1.0, 15.0, abs(p.x));
    float ridge = sin(p.x * .32 + sin(travel * .105) * 1.8);
    float detail = sin(p.x * .92 + travel * .24) * .45 + sin(p.x * 1.7 - travel * .38) * .18;
    return banks * (2.0 + ridge * 2.6 + sin(travel * .19) * 1.4 + detail) + sin(travel * .25) * .13;
  }
`;
function injectTerrain(shader, uniforms, normals) {
  shader.uniforms.uTime = uniforms.uTime;
  shader.vertexShader = terrainGLSL + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); transformed.z += terrain(position.xy);');
  if (normals) shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
    float eps = .045;
    float dx = (terrain(position.xy + vec2(eps, 0.0)) - terrain(position.xy - vec2(eps, 0.0))) / (2.0 * eps);
    float dy = (terrain(position.xy + vec2(0.0, eps)) - terrain(position.xy - vec2(0.0, eps))) / (2.0 * eps);
    vec3 objectNormal = normalize(vec3(-dx, -dy, 1.0));
  `);
}
function Terrain({ uniforms, low }) {
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#434942', metalness: .95, roughness: .1, envMapIntensity: 1.8 });
    m.onBeforeCompile = shader => injectTerrain(shader, uniforms, true);
    m.customProgramCacheKey = () => 'trail-pbr-v1';
    return m;
  }, [uniforms]);
  const wire = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: '#ccff00', wireframe: true, transparent: true, opacity: .065, depthWrite: false });
    m.onBeforeCompile = shader => injectTerrain(shader, uniforms, false);
    m.customProgramCacheKey = () => 'trail-wire-v1';
    return m;
  }, [uniforms]);
  useEffect(() => () => { material.dispose(); wire.dispose(); }, [material, wire]);
  return <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.4, -65]}>
    <mesh material={material} frustumCulled={false}><planeGeometry args={[100, 190, low ? 120 : 220, low ? 190 : 340]} /></mesh>
    <mesh material={wire} position={[0, 0, .025]} frustumCulled={false}><planeGeometry args={[100, 190, 90, 170]} /></mesh>
  </group>;
}
const particleVertex = `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.z = mod(p.z + uTime * (12.0 + aSeed * 14.0) + 90.0, 100.0) - 85.0;
    p.y = mod(p.y - uTime * (0.4 + aSeed) + 60.0, 22.0) - 3.0;
    p.x += sin(uTime * .3 + aSeed * 60.0) * .7;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((35.0 + aSeed * 45.0) / max(1.0, -mv.z), 1.0, 5.0) * uPixelRatio;
    vAlpha = smoothstep(0.0, 8.0, -mv.z) * (0.25 + aSeed * .75);
  }
`;
const particleFragment = `
  varying float vAlpha;
  void main() {
    float glow = 1.0 - smoothstep(.08, .5, length(gl_PointCoord - .5));
    gl_FragColor = vec4(mix(vec3(1.0, .33, .0), vec3(.8, 1.0, .0), gl_PointCoord.y), glow * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
function Sparks({ uniforms }) {
  const data = useMemo(() => {
    const positions = new Float32Array(640 * 3), seeds = new Float32Array(640);
    let seed = 73;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 640; i++) {
      positions.set([(random() - .5) * 75, random() * 22, random() * 100 - 85], i * 3);
      seeds[i] = random();
    }
    return { positions, seeds };
  }, []);
  const particleUniforms = useMemo(() => ({ uTime: uniforms.uTime, uPixelRatio: { value: 1 } }), [uniforms]);
  useFrame(({ gl }) => { particleUniforms.uPixelRatio.value = gl.getPixelRatio(); });
  return <points frustumCulled={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[data.positions, 3]} /><bufferAttribute attach="attributes-aSeed" args={[data.seeds, 1]} /></bufferGeometry><shaderMaterial uniforms={particleUniforms} vertexShader={particleVertex} fragmentShader={particleFragment} transparent depthWrite={false} blending={THREE.AdditiveBlending} /></points>;
}
function Scene({ controls, reduced, low, hud }) {
  const world = useRef(), lime = useRef(), orange = useRef();
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((_, delta) => {
    const dt = Math.min(delta, .05);
    const remaining = Math.max(0, (controls.current.boostUntil - performance.now()) / 1000);
    const boosting = remaining > 0 && !reduced;
    const factor = 1 - Math.exp(-3.2 * dt);
    controls.current.velocity = THREE.MathUtils.lerp(controls.current.velocity, boosting ? 3.8 : 1, factor);
    if (!reduced) uniforms.uTime.value += dt * controls.current.velocity;
    world.current.rotation.z = THREE.MathUtils.lerp(world.current.rotation.z, reduced ? 0 : -controls.current.x * .045, factor);
    world.current.rotation.y = THREE.MathUtils.lerp(world.current.rotation.y, reduced ? 0 : controls.current.x * .065, factor);
    world.current.rotation.x = THREE.MathUtils.lerp(world.current.rotation.x, reduced ? 0 : controls.current.y * .025, factor);
    lime.current.intensity = boosting ? 18 : 6;
    orange.current.intensity = boosting ? 1800 : 600;
    if (hud.current) hud.current.textContent = boosting ? `TURBO / ${remaining.toFixed(2)} S` : reduced ? 'PAUSA PARA OBSERVAR' : 'SEMPRE APRENDENDO';
  });
  return <><color attach="background" args={['#050506']} /><fogExp2 attach="fog" args={['#050506', .018]} /><ambientLight intensity={.18} />
    <directionalLight ref={lime} color="#ccff00" position={[-15, 10, -30]} intensity={6} />
    <pointLight ref={orange} color="#ff5500" position={[10, 7, -36]} intensity={600} distance={100} decay={1.5} />
    <Environment resolution={128} frames={1}>
      <Lightformer color="#ccff00" intensity={5} position={[-10, 8, -15]} rotation={[Math.PI / 2, 0, .4]} scale={[3, 45, 1]} />
      <Lightformer color="#ff5500" intensity={7} position={[15, 5, -22]} rotation={[0, -Math.PI / 2, 0]} scale={[30, 5, 1]} />
      <Lightformer color="#c5d3e6" intensity={1.5} position={[0, 15, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[20, 20, 1]} />
    </Environment>
    <group ref={world}><Terrain uniforms={uniforms} low={low} /><Sparks uniforms={uniforms} /><mesh position={[0, 4, -70]}><torusGeometry args={[9, .035, 6, 100]} /><meshBasicMaterial color="#ccff00" toneMapped={false} /></mesh></group><AdaptiveDpr pixelated />
  </>;
}
class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="gpu-fallback">Experiência 3D indisponível neste dispositivo. Explore o portfólio abaixo.</div> : this.props.children; }
}
function Arrow() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" /></svg>; }
function App() {
  const controls = useRef({ x: 0, y: 0, boostUntil: 0, velocity: 1 });
  const hud = useRef(), timeout = useRef(), hero = useRef();
  const [boosting, setBoosting] = useState(false);
  const [low, setLow] = useState(() => window.innerWidth < 768);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    let intersecting = true;
    const sync = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; sync(); });
    observer.observe(hero.current);
    document.addEventListener('visibilitychange', sync);
    return () => { media.removeEventListener('change', change); observer.disconnect(); document.removeEventListener('visibilitychange', sync); clearTimeout(timeout.current); };
  }, []);
  const boost = event => {
    if (event.target.closest('a, button') && !event.target.closest('[data-boost]')) return;
    if (reduced) return;
    controls.current.boostUntil = performance.now() + 1000;
    setBoosting(true);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setBoosting(false), 1000);
  };
  return <><a className="skip" href="#sobre">Pular para o conteúdo</a>
    <section ref={hero} className={`hero relative isolate overflow-hidden ${boosting ? 'is-boosting' : ''}`} onClick={boost} onPointerMove={event => {
      if (event.pointerType === 'touch') return;
      const bounds = event.currentTarget.getBoundingClientRect();
      controls.current.x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
      controls.current.y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
    }} onPointerLeave={() => { controls.current.x = 0; controls.current.y = 0; }}>
      <div className="absolute inset-0 -z-20" aria-hidden="true"><SceneBoundary><Suspense fallback={<div className="gpu-fallback">CARREGANDO…</div>}><Canvas camera={{ position: [0, 3.6, 12], fov: 64, near: .1, far: 230 }} dpr={low ? 1 : [1, 1.5]} frameloop={visible && !reduced ? 'always' : 'demand'} gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }} fallback={<div className="gpu-fallback">WebGL indisponível neste navegador.</div>} onCreated={({ camera }) => camera.lookAt(0, -.8, -32)}><PerformanceMonitor onDecline={() => setLow(true)}><Scene controls={controls} reduced={reduced} low={low} hud={hud} /></PerformanceMonitor></Canvas></Suspense></SceneBoundary></div>
      <div className="scene-shade pointer-events-none absolute inset-0 -z-10" /><div className="speed-flash pointer-events-none absolute inset-0 -z-10" />
      <header className="relative mx-auto flex w-[90%] items-center justify-between gap-4 pt-7 md:pt-10">
        <a href="#" className="flex items-center gap-3" aria-label="Abraão Lins, início"><span className="brand-mark">A<span>↗</span></span><span className="text-[10px] font-bold leading-relaxed tracking-[.18em]">ABRAÃO LINS<span className="block text-[#7d8178]">PORTFÓLIO PESSOAL</span></span></a>
        <nav aria-label="Principal" className="glass-nav hidden items-center gap-7 rounded-full border border-white/15 px-7 py-4 text-[10px] uppercase tracking-[.15em] md:flex"><a href="#sobre">Sobre mim</a><a href="#universo">Interesses</a><a href="#jornada">Formação <span className="ml-2 text-lime">↗</span></a></nav>
        <a href="#sobre" className="text-[10px] tracking-[.12em]">IFRO / 3º ANO <span className="ml-2 text-lime">●</span></a>
      </header>
      <main className="hero-content personal-hero relative mx-auto w-[90%]">
        <div className="personal-copy">
          <p className="eyebrow flex items-center gap-3"><span className="h-1.5 w-1.5 rounded-full bg-lime" /> UM POUCO DE MIM. UM MUNDO PARA DESCOBRIR.</p>
          <p className="hello">Prazer, eu sou</p>
          <h1 className="personal-name">Abraão<span>Lins<span className="name-dot">.</span></span></h1>
          <p className="personal-lead">Uma mente curiosa entre a <span>tecnologia</span> e o cuidado com as <span>pessoas.</span></p>
          <p className="personal-bio">Estou no <strong>3º ano do ensino médio no IFRO</strong>. Gosto de explorar o mundo da tecnologia e quero conhecer mais a área da saúde. Ainda estou descobrindo meu caminho — e este portfólio faz parte dele.</p>
          <div className="personal-actions"><a href="#sobre" className="trail-button">Conheça minha história <Arrow /></a><a href="#universo" className="quiet-link">Meus interesses <span>↗</span></a></div>
          <div className="personal-facts"><div><span>ONDE ESTUDO</span><strong>IFRO</strong></div><div><span>MEU MOMENTO</span><strong>3º ano do ensino médio</strong></div><div><span>O QUE ME MOVE</span><strong>Curiosidade</strong></div></div>
        </div>
        <figure className="personal-portrait">
          <div className="photo-index"><span>01 / QUEM ESTÁ POR AQUI</span><span>↗</span></div>
          <img src={portrait} alt="Abraão Lins de moletom preto, em uma selfie com fundo claro e luz suave" width="1122" height="1402" fetchPriority="high" />
          <figcaption><span>Abraão Genelhud<br />Lins de Mendonça</span><span className="text-lime">✳</span></figcaption>
          <div className="photo-note"><span>+</span> Aprendendo hoje.<br />Imaginando o amanhã.</div>
        </figure>
      </main>
      <div className="relative mx-auto flex w-[90%] flex-wrap items-center justify-between gap-5 border-t border-white/15 py-6 text-[8px] tracking-[.16em] text-[#92988a]"><div className="flex items-center gap-3"><span className={`h-1.5 w-1.5 rounded-full ${boosting ? 'bg-[#ff5500]' : 'bg-lime'}`} /><span ref={hud}>SEMPRE APRENDENDO</span></div><button data-boost disabled={reduced} className="boost-control flex items-center gap-3 uppercase disabled:opacity-40" aria-label="Ativar turbo por um segundo"><span className="text-lg text-lime">⌁</span>{reduced ? 'MOVIMENTO REDUZIDO ATIVO' : 'INTERAGIR COM O FUNDO'}<span className="border border-white/20 px-1.5 py-1">1 SEC</span></button><a href="#sobre" className="flex items-center gap-5">MAIS SOBRE MIM <span className="text-lg text-white">↓</span></a></div>
    </section>
    <section id="sobre" className="mx-auto grid w-[90%] gap-12 border-t border-white/10 py-24 md:grid-cols-[.8fr_1.2fr] md:gap-24 md:py-32"><div className="portrait-frame relative max-w-[410px]"><img src={aboutPortrait} alt="Abraão Lins de corpo inteiro, com camiseta branca e fundo escuro" width="1086" height="1448" loading="lazy" className="about-studio w-full" /><span className="absolute inset-x-0 bottom-0 bg-black/70 px-5 py-4 text-[9px] tracking-[.15em] backdrop-blur">ABRAÃO LINS <span className="float-right text-lime">● EM EVOLUÇÃO</span></span><span className="portrait-corner" /></div><div className="self-center"><p className="eyebrow">01 / MINHA HISTÓRIA</p><h2 className="section-title">Mais sobre mim.<br /><span className="text-lime">Além da primeira impressão.</span></h2><p className="body-copy">Sou Abraão Genelhud Lins de Mendonça, estudante do 3º ano do ensino médio no IFRO. Gosto de tecnologia e de descobrir como as coisas funcionam.</p><p className="body-copy mt-4">A área da saúde tem chamado minha atenção. Quero entender melhor as possibilidades desse universo e descobrir como meu interesse por tecnologia pode se conectar a ele. Não tenho todas as respostas sobre o futuro, mas tenho vontade de aprender.</p><div className="mt-8 flex flex-wrap gap-3 text-[9px] tracking-widest"><span className="border border-white/20 px-3 py-2">TECNOLOGIA</span><span className="border border-white/20 px-3 py-2">SAÚDE</span><span className="border border-lime/40 px-3 py-2 text-lime">CURIOSIDADE ↗</span></div></div></section>
    <section aria-label="Meu perfil e objetivos" className="mx-auto mb-20 grid w-[90%] gap-px border border-white/15 bg-white/15 md:grid-cols-3">
      <article className="bg-[#090a09] p-7"><p className="eyebrow">MINHA FORMAÇÃO</p><h2 className="mb-3 text-xl font-semibold">Ensino médio · 3º ano</h2><p className="body-copy">Instituto Federal de Rondônia — IFRO. Estou construindo minha base e pensando nos próximos passos da minha formação.</p></article>
      <article className="bg-[#090a09] p-7"><p className="eyebrow">O QUE DESPERTA MEU INTERESSE</p><h2 className="mb-3 text-xl font-semibold">Tecnologia + saúde</h2><p className="body-copy">Gosto de tecnologia e quero conhecer mais a área da saúde. A possibilidade de aproximar essas duas áreas me instiga.</p></article>
      <article className="bg-[#090a09] p-7"><p className="eyebrow">MEU MOMENTO</p><h2 className="mb-3 text-xl font-semibold">Explorar para escolher</h2><p className="body-copy">Quero entender melhor minhas possibilidades, ampliar meus conhecimentos e descobrir uma direção que faça sentido para mim.</p></article>
    </section>
    <section id="universo" className="mx-auto w-[90%] border-t border-white/10 py-24"><div className="mb-12 flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow">02 / MEUS INTERESSES</p><h2 className="section-title">Os assuntos que<br /><span className="text-lime">prendem minha atenção.</span></h2></div><p className="text-xs leading-6 text-[#8f9588]">Três direções para explorar.<br />Um futuro inteiro para construir.</p></div><div className="grid gap-px border border-white/15 bg-white/15 md:grid-cols-3">{[['01', 'TECNOLOGIA', 'Entender o mundo digital, explorar ferramentas e descobrir como uma ideia pode se tornar algo útil.', '⌘'], ['02', 'SAÚDE', 'Conhecer o corpo humano, o bem-estar e as possibilidades de formação para cuidar de pessoas.', '+'], ['03', 'CONEXÕES', 'Investigar onde tecnologia e saúde se encontram. Aprender com novas perspectivas e boas perguntas.', '↗']].map(([n, title, copy, icon]) => <article key={n} className="route-card group bg-[#090a09] p-8 md:p-10"><div className="mb-16 flex items-center justify-between"><span className="text-[10px] text-[#666e60]">INTERESSE / {n}</span><span className="text-4xl font-light text-lime transition-transform group-hover:rotate-12">{icon}</span></div><h3 className="mb-5 text-sm font-bold tracking-widest">{title}</h3><p className="text-xs leading-7 text-[#979d90]">{copy}</p></article>)}</div></section>
    <section id="jornada" className="mx-auto grid w-[90%] gap-12 border-t border-white/10 py-24 md:grid-cols-2"><div><p className="eyebrow">03 / FORMAÇÃO & FUTURO</p><h2 className="section-title">Meu presente.<br /><span className="text-lime">E o que vem depois.</span></h2><p className="body-copy">Ainda no começo. A cada descoberta, uma nova direção.</p></div><div>{[['AGORA', '3º ano no IFRO', 'Uma etapa importante da minha formação e um olhar cada vez mais atento ao futuro.'], ['NO RADAR', 'Explorar a área da saúde', 'Conhecer possibilidades e entender quais caminhos combinam com meus interesses.'], ['PRÓXIMOS PASSOS', 'Aprender e compartilhar', 'Registrar novas descobertas e projetos conforme eles entrarem na minha trajetória.']].map(([label, title, copy]) => <article key={label} className="border-b border-white/10 py-6 first:pt-0"><p className="mb-3 text-[8px] tracking-[.2em] text-lime">{label}</p><h3 className="mb-2 text-base">{title}</h3><p className="text-xs leading-6 text-[#8f9588]">{copy}</p></article>)}</div></section>
    <footer className="mx-auto flex w-[90%] flex-wrap items-center justify-between gap-5 border-t border-white/15 py-8 text-[9px] tracking-widest text-[#909589]"><span>ABRAÃO LINS / SEMPRE EM CONSTRUÇÃO.</span><a className="text-lime" href="#">VOLTAR AO TOPO ↗</a></footer>
  </>;
}
createRoot(document.getElementById('root')).render(<App />);
