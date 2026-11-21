import { useEffect, useRef, useState } from 'react';
import { Cartesian3, Color, Math as CesiumMath, Viewer } from 'cesium';
import { installEarthImagery, sharpenRendering } from '../earth/imagery';
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
  const chooser = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (chooseArea && !chooser.current?.open) chooser.current?.showModal();
    else if (!chooseArea && chooser.current?.open) chooser.current.close();
  }, [chooseArea]);
  const scroller = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const root = scroller.current!, visual = stage.current!;
    const update = () => {
      const p = Math.min(1, root.scrollTop / Math.max(1, root.scrollHeight - root.clientHeight));
      progress.current = p;
      visual.style.setProperty('--diagram-opacity', String(Math.max(0, 1 - p * 4)));
      visual.style.setProperty('--earth-opacity', String(Math.min(1, p * 5)));
    };
    root.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update); observer.observe(root);
    update();
    return () => { root.removeEventListener('scroll', update); observer.disconnect(); };
  }, []);
  useEffect(() => {
    const mount = canvas.current!;
    let viewer: Viewer;
    try {
      viewer = new Viewer(mount, {
        animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
        homeButton: false, sceneModePicker: false, navigationHelpButton: false,
        fullscreenButton: false, infoBox: false, selectionIndicator: false,
        baseLayer: false, showRenderLoopErrors: false,
        requestRenderMode: true, maximumRenderTimeChange: Infinity,
      });
    } catch { setFailed(true); mount.replaceChildren(); return; }
    sharpenRendering(viewer, 2);
    viewer.scene.backgroundColor = Color.fromCssColorString('#080f13');
    viewer.scene.globe.enableLighting = false;
    viewer.scene.screenSpaceCameraController.enableInputs = false;
    const stopImagery = installEarthImagery(viewer, () => {}, { detailedGlobe: true });
    const stopError = viewer.scene.renderError.addEventListener(() => setFailed(true));
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rendered = -1, current = 0, raf = 0, last = performance.now();
    const frame = (time: number) => {
      const dt = Math.min(0.05, (time - last) / 1000); last = time;
      const target = progress.current;
      current = motion.matches ? target : current + (target - current) * (1 - Math.exp(-dt / 0.18));
      if (Math.abs(current - rendered) > 0.0001) {
        const zoom = Math.max(0, Math.min(1, (current - 0.36) / 0.55));
        const eased = zoom * zoom * (3 - 2 * zoom);
        const height = Math.exp(Math.log(20_000_000) * (1 - eased) + Math.log(60_000) * eased);
        viewer.camera.setView({ destination: Cartesian3.fromDegrees(-95.37, 23 + 6.76 * eased, height), orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 } });
        viewer.scene.requestRender(); rendered = current;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); stopError(); stopImagery(); viewer.destroy(); };
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
    <a className="landing-skip" href="#/simulate">Skip introduction and open EarthLab</a>
    <header className="landing-header">
      <a href="#/" className="landing-brand" aria-label="EarthLab home"><Icon name="globe" size={25} />EarthLab</a>
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
      <section className="landing-chapter landing-houston"><div className="landing-copy"><h2>Down to<br />street level.</h2><p>Change a storm. Compare its modeled impact. Trace a route through the scenario.</p><a className="landing-primary" href="#/simulate">Open EarthLab <Icon name="arrow" size={18} /></a><small>Exploratory scenarios, not live emergency guidance.</small></div></section>
    </main>
    <dialog className="area-chooser" ref={chooser} aria-labelledby="area-title" onCancel={onCloseChooser}>
      <div className="area-heading"><h2 id="area-title">Where in Houston?</h2><button type="button" onClick={onCloseChooser} aria-label="Close area selection">Close</button></div>
      <p>Choose an area to open its flood simulation.</p>
      <nav aria-label="Houston simulation areas">
        {HOUSTON.zones.map(area => <a key={area.id} href={`#/zone/${area.id}`}>
          <span><strong>{area.name}</strong><small>{area.area}</small></span><Icon name="arrow" size={18} />
        </a>)}
      </nav>
    </dialog>
    <footer className="landing-footer"><span>Houston, Texas · 29.76° N / 95.37° W</span><span>Satellite: Esri & contributors · Houston: USDA / USGS</span></footer>
  </div>;
}
