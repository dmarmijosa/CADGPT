import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RenderedScene, SCENE_FACTORY } from './scene-factory';
import { StlViewer } from './stl-viewer';

describe('StlViewer', () => {
  it('never invokes the scene factory during a simulated server-rendered pass (spec mesh-viewer: SSR pass skips three.js)', async () => {
    const sceneFactory = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: SCENE_FACTORY, useValue: sceneFactory },
      ],
    });

    const fixture = TestBed.createComponent(StlViewer);
    fixture.componentRef.setInput('mesh', new ArrayBuffer(0));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(sceneFactory).not.toHaveBeenCalled();
  });

  it('mounts the container and calls the scene factory with the mesh buffer in the browser, and disposes on destroy', async () => {
    const dispose = vi.fn();
    const scene: RenderedScene = { dispose };
    const sceneFactory = vi.fn().mockResolvedValue(scene);
    TestBed.configureTestingModule({
      providers: [{ provide: SCENE_FACTORY, useValue: sceneFactory }],
    });

    const buffer = new ArrayBuffer(8);
    const fixture = TestBed.createComponent(StlViewer);
    fixture.componentRef.setInput('mesh', buffer);
    fixture.detectChanges();
    await fixture.whenStable();

    const container: HTMLElement = fixture.nativeElement.querySelector('.stl-viewer');
    expect(container).toBeTruthy();
    expect(sceneFactory).toHaveBeenCalledWith(container, buffer);

    fixture.destroy();
    expect(dispose).toHaveBeenCalled();
  });
});
