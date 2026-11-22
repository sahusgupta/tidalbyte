import { useEffect, useRef, useState } from 'react';
import type { LandingGlobe } from './landingGlobe';
import { RegionInset } from '../earth/RegionInset';
import { HOUSTON } from '../earth/zones';
import { Icon } from '../../app/Icon';
import '@fontsource-variable/source-sans-3';
import '@fontsource/baskervville/400.css';
import './landing.css';

const sources = ['Rainfall', 'Elevation', 'Roads', 'Hospitals', 'Bayous', 'Buildings', 'Drainage', 'Storm history'];
const point = (i: number, radius: number) => {
  const a = i * Math.PI / 4 - Math.PI / 2;
  return [300 + Math.cos(a) * radius, 300 + Math.sin(a) * radius];
};
function EvidenceDiagram() {
  return <svg viewBox="0 0 600 600" role="img" aria-label="Rainfall, terrain, roads, hospitals and other inputs inform the Houston scenario. Diagram is illustrative, not measured data.">
    {[50, 95, 140, 185].map(r => <polygon key={r} points={sources.map((_, i) => point(i, r).join(',')).join(' ')} />)}
    {sources.map((label, i) => {
      const [x, y] = point(i, 238);
      return <g key={label}><line x1="300" y1="300" x2={point(i,185)[0]} y2={point(i,185)[1]} /><circle cx={point(i,140)[0]} cy={point(i,140)[1]} r="4" /><text x={x} y={y} dy=".35em" textAnchor="middle">{label}</text></g>;
    })}
    <circle className="landing-diagram-core" cx="300" cy="300" r="8" />
  </svg>;
}

export default function Landing({ chooseArea = false, onCloseChooser }: { chooseArea?: boolean; onCloseChooser?: () => void }) {
  const [preview, setPreview] = useState(HOUSTON.zones[0]);
  const chooser = useRef<HTMLDialogElement>(null);
  const syncScene = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (chooseArea && !chooser.current?.open) chooser.current?.showModal();
    else if (!chooseArea && chooser.current?.open) chooser.current.close();
    syncScene.current?.();
  }, [chooseArea]);
  const scroller = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const root = scroller.current!, visual = stage.current!, mount = canvas.current!;
    let globe: LandingGlobe | undefined;
    let importing = false;
    let disposed = false;
    let unavailable = false;
    let visible = false;
    let progress = 0;

    const fail = () => {
      if (disposed) return;
      unavailable = true;
      setFailed(true);
      // Cesium can report an error during a draw. Release its resources after that draw exits.
      queueMicrotask(() => {
        if (disposed) return;
        globe?.destroy();
        globe = undefined;
        mount.replaceChildren();
      });
    };
    const update = () => {
      progress = Math.min(1, Math.max(0, root.scrollTop / Math.max(1, root.scrollHeight - root.clientHeight)));
      visual.style.setProperty('--diagram-opacity', String(Math.max(0, 1 - progress * 4)));
      visual.style.setProperty('--earth-opacity', String(Math.min(1, progress * 5)));
      visible = progress > 0 && !chooser.current?.open && !document.hidden;
      if (unavailable) return;
      if (globe) {
        globe.update(progress, visible);
      } else if (visible && !importing) {
        importing = true;
        import('./landingGlobe').then(({ createLandingGlobe }) => {
          importing = false;
          if (disposed || !visible) return;
          globe = createLandingGlobe(mount, progress, fail);
        }).catch(fail);
      }
    };
    syncScene.current = update;
    root.addEventListener('scroll', update, { passive: true });
    document.addEventListener('visibilitychange', update);
    const observer = new ResizeObserver(update); observer.observe(root);
    update();
    return () => {
      disposed = true;
      syncScene.current = null;
      root.removeEventListener('scroll', update);
      document.removeEventListener('visibilitychange', update);
      observer.disconnect();
      globe?.destroy();
    };
  }, []);
  useEffect(() => {
    if (typeof AudioContext === 'undefined') return;
    const journeySound = new AudioContext();
    const unlock = () => {
      if (journeySound.state === 'suspended') void journeySound.resume().catch(() => {});
    };
    const root = scroller.current!;
    let lastPosition = root.scrollTop;
    let lastMove = performance.now();
    let idle: ReturnType<typeof setTimeout>;
    const tone = journeySound.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = 160;
    const gain = journeySound.createGain();
    gain.gain.value = 0;
    tone.connect(gain).connect(journeySound.destination);
    tone.start();
    const fade = () => gain.gain.setTargetAtTime(0, journeySound.currentTime, 0.055);
    const onScroll = () => {
      const position = root.scrollTop;
      const distance = Math.abs(position - lastPosition);
      lastPosition = position;
      if (!distance || document.hidden || chooser.current?.open) return;
      if (journeySound.state !== 'running') return;
      const now = performance.now();
      const speed = Math.min(1, distance / Math.max(8, now - lastMove));
      lastMove = now;
      const progress = Math.max(0, Math.min(1, position / Math.max(1, root.scrollHeight - root.clientHeight)));
      const time = journeySound.currentTime;
      // Absolute scroll depth makes reversals glide back along the same pitch curve.
      tone.frequency.setTargetAtTime(160 + 16 * progress, time, 0.085);
      gain.gain.setTargetAtTime(0.012 + speed * 0.008, time, 0.065);
      clearTimeout(idle);
      idle = setTimeout(fade, 135);
    };
    const gestures = ['pointerdown', 'pointerup', 'click', 'keydown'] as const;
    gestures.forEach(event => root.addEventListener(event, unlock, { capture: true, passive: true }));
    root.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', fade);
    return () => {
      clearTimeout(idle);
      gestures.forEach(event => root.removeEventListener(event, unlock, true));
      root.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', fade);
      tone.stop();
      gain.disconnect();
      void journeySound.close();
    };
  }, []);
  const beginJourney = () => {
    const root = scroller.current;
    if (!root) return;
    root.scrollTo({
      top: root.clientHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };
  return <div className="landing" ref={scroller}>
    <a className="landing-skip" href="#/simulate">Skip introduction and open flŭd</a>
    <header className="landing-header">
      <a href="#/" className="landing-brand" aria-label="flŭd home"><Icon name="globe" size={25} />flŭd</a>
    </header>
    <div className="landing-visual" ref={stage} aria-hidden="true">
      <div className="landing-stars" />
      <div className="landing-earth" ref={canvas} />
      {failed && <div className="landing-fallback" />}
      <div className="landing-shade" />
      <div className="landing-diagram"><EvidenceDiagram /></div>
    </div>
    <main className="landing-story">
      <section className="landing-chapter landing-intro">
        <div className="landing-copy"><h1>A changing city.<br />A clearer picture.</h1><p>Explore how storms could reshape Houston’s roads, buildings and access to care.</p><button className="landing-primary" onClick={beginJourney}>Explore Houston <Icon name="down" size={18} /></button></div>
        <a className="landing-scroll" href="#landing-earth" onClick={e => { e.preventDefault(); beginJourney(); }}>Scroll to see the bigger picture <Icon name="down" size={18} /></a>
      </section>
      <section id="landing-earth" className="landing-chapter landing-orbit"><div className="landing-copy"><h2>One planet.<br />Our corner of it.</h2><p>Start with Earth. Follow the Gulf Coast to the bayous, neighborhoods and streets of Houston.</p><button className="landing-text-link" onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>Continue down to Houston <Icon name="down" size={15} /></button></div></section>
      <section className="landing-chapter landing-houston"><div className="landing-copy"><h2>Down to<br />street level.</h2><p>Change a storm. Compare its modeled impact. Trace a route through the scenario.</p><a className="landing-primary" href="#/simulate">Open flŭd <Icon name="arrow" size={18} /></a><small>Exploratory scenarios, not live emergency guidance.</small></div></section>
    </main>
    <dialog className="area-chooser" ref={chooser} aria-labelledby="area-title" onCancel={onCloseChooser}>
      <div className="area-heading"><h2 id="area-title">Where in Houston?</h2><button type="button" onClick={onCloseChooser} aria-label="Close area selection">Close</button></div>
      <div className="area-spread">
        <div className="area-preview">
          <RegionInset region={HOUSTON} highlighted={preview.id} />
          <div className="area-caption"><strong>{preview.name}</strong><p>{preview.summary}</p></div>
        </div>
        <nav aria-label="Houston simulation areas">
          {HOUSTON.zones.map((area, index) => <a key={area.id} href={`#/zone/${area.id}`}
            data-preview={preview.id === area.id} onFocus={() => setPreview(area)} onMouseEnter={() => setPreview(area)}>
            <span className="area-key" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
            <span><strong>{area.name}</strong><small>{area.area}</small></span><Icon name="arrow" size={16} />
          </a>)}
        </nav>
      </div>
    </dialog>
    <footer className="landing-footer"><span>Houston, Texas · 29.76° N / 95.37° W</span><span>Satellite: Esri & contributors · Houston: USDA / USGS</span></footer>
  </div>;
}
