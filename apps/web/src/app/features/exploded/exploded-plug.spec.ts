import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { computeExplodeProgress } from './explode-progress';
import { ExplodedPlug } from './exploded-plug';
import { PLUG_SCENE_FACTORY, RenderedPlugScene } from './exploded-scene';

describe('computeExplodeProgress', () => {
  it('is 0 at the top of the scroll track and 1 once the track is fully scrolled', () => {
    expect(computeExplodeProgress(0, 3000, 800)).toBe(0);
    expect(computeExplodeProgress(-1100, 3000, 800)).toBeCloseTo(0.5, 5);
    expect(computeExplodeProgress(-2200, 3000, 800)).toBeCloseTo(1, 5);
  });

  it('clamps to [0,1] and treats a wrapper shorter than the viewport as never scrollable', () => {
    expect(computeExplodeProgress(-5000, 3000, 800)).toBe(1);
    expect(computeExplodeProgress(200, 3000, 800)).toBe(0);
    expect(computeExplodeProgress(-100, 500, 800)).toBe(0);
  });
});

function fakeScene(): { scene: RenderedPlugScene; setProgress: ReturnType<typeof vi.fn> } {
  const setProgress = vi.fn();
  return { scene: { setProgress, dispose: vi.fn() }, setProgress };
}

describe('ExplodedPlug', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never invokes the scene factory during a simulated server-rendered pass', async () => {
    const sceneFactory = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: PLUG_SCENE_FACTORY, useValue: sceneFactory },
      ],
    });

    const fixture = TestBed.createComponent(ExplodedPlug);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(sceneFactory).not.toHaveBeenCalled();
  });

  it('mounts the container and calls the scene factory once in the browser, and disposes on destroy', async () => {
    const { scene, setProgress: _unused } = fakeScene();
    const sceneFactory = vi.fn().mockResolvedValue(scene);
    TestBed.configureTestingModule({
      providers: [{ provide: PLUG_SCENE_FACTORY, useValue: sceneFactory }],
    });

    const fixture = TestBed.createComponent(ExplodedPlug);
    fixture.detectChanges();
    await fixture.whenStable();

    const container: HTMLElement = fixture.nativeElement.querySelector('.exploded-hero__canvas');
    expect(container).toBeTruthy();
    expect(sceneFactory).toHaveBeenCalledTimes(1);
    expect(sceneFactory).toHaveBeenCalledWith(container, { reducedMotion: false });

    fixture.destroy();
    expect(scene.dispose).toHaveBeenCalled();
  });

  it('maps an increasing scroll position into an increasing explode progress sent to the scene', async () => {
    const { scene, setProgress } = fakeScene();
    const sceneFactory = vi.fn().mockResolvedValue(scene);
    TestBed.configureTestingModule({
      providers: [{ provide: PLUG_SCENE_FACTORY, useValue: sceneFactory }],
    });

    const fixture = TestBed.createComponent(ExplodedPlug);
    fixture.detectChanges();
    await fixture.whenStable();

    const wrapper: HTMLElement = fixture.nativeElement.querySelector('.exploded-hero');
    Object.defineProperty(wrapper, 'offsetHeight', { value: 3000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({ top: -2200 } as DOMRect);

    setProgress.mockClear();
    window.dispatchEvent(new Event('scroll'));

    // Let a handful of rAF frames run so the eased progress climbs toward the
    // new (exploded) target instead of asserting a single synchronous jump.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(setProgress).toHaveBeenCalled();
    const values = setProgress.mock.calls.map((call) => call[0] as number);
    expect(values[0]).toBeGreaterThan(0);
    expect(values[values.length - 1]).toBeGreaterThan(values[0]);

    fixture.destroy();
  });

  it('reduced motion: builds the scene once but never attaches a scroll listener', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { scene } = fakeScene();
    const sceneFactory = vi.fn().mockResolvedValue(scene);
    TestBed.configureTestingModule({
      providers: [{ provide: PLUG_SCENE_FACTORY, useValue: sceneFactory }],
    });

    const fixture = TestBed.createComponent(ExplodedPlug);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(sceneFactory).toHaveBeenCalledWith(expect.anything(), { reducedMotion: true });
    expect(addSpy).not.toHaveBeenCalledWith('scroll', expect.anything(), expect.anything());

    const note: HTMLElement = fixture.nativeElement.querySelector('.exploded-hero__note');
    expect(note?.textContent).toContain('Motion reduced');

    fixture.destroy();
  });

  it('shows a graceful fallback when the scene factory rejects (no WebGL)', async () => {
    const sceneFactory = vi.fn().mockRejectedValue(new Error('WebGL unavailable'));
    TestBed.configureTestingModule({
      providers: [{ provide: PLUG_SCENE_FACTORY, useValue: sceneFactory }],
    });

    const fixture = TestBed.createComponent(ExplodedPlug);
    fixture.detectChanges();
    await fixture.whenStable();
    // The rejection is caught one microtask after the factory call resolves
    // its promise; give it a tick before asserting the fallback rendered.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const canvas: HTMLElement = fixture.nativeElement.querySelector('.exploded-hero__canvas');
    expect(canvas.hidden).toBe(true);
    const note: HTMLElement = fixture.nativeElement.querySelector('.exploded-hero__note');
    expect(note?.textContent).toContain('unavailable');
  });
});
