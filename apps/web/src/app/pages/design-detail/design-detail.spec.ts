import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { RenderedScene, SCENE_FACTORY } from '../../features/viewer/scene-factory';
import { DesignDetail, DesignDetailPage } from './design-detail';

const baseDesign: DesignDetail = {
  id: 'doc-1',
  name: 'Bracket',
  cadKind: 'FreeCAD',
  created: 1000,
  updated: 2000,
  latestJobId: 'job-1',
  hasMesh: false,
};

describe('DesignDetailPage', () => {
  it('renders the pending state and never fetches the mesh binary when hasMesh is false (spec mesh-viewer: Pending State Without Mesh)', async () => {
    const requestArrayBuffer = vi.fn();
    const api = {
      request: vi.fn().mockResolvedValue({ ...baseDesign, hasMesh: false }),
      requestArrayBuffer,
    };
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: api }, provideRouter([])],
    });

    const fixture = TestBed.createComponent(DesignDetailPage);
    fixture.componentRef.setInput('id', 'doc-1');
    fixture.detectChanges();
    await fixture.componentInstance.ready;
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('Preview pending');
    expect(root.querySelector('app-stl-viewer')).toBeNull();
    expect(requestArrayBuffer).not.toHaveBeenCalled();

    fixture.destroy();
  });

  it('fetches the mesh and mounts the viewer once hasMesh is true, and disposes the scene when the page is destroyed (spec mesh-viewer: Preview renders after job completion)', async () => {
    const buffer = new ArrayBuffer(4);
    const api = {
      request: vi.fn().mockResolvedValue({ ...baseDesign, hasMesh: true }),
      requestArrayBuffer: vi.fn().mockResolvedValue(buffer),
    };
    const dispose = vi.fn();
    const scene: RenderedScene = { dispose };
    const sceneFactory = vi.fn().mockResolvedValue(scene);
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: SCENE_FACTORY, useValue: sceneFactory },
        provideRouter([]),
      ],
    });

    const fixture = TestBed.createComponent(DesignDetailPage);
    fixture.componentRef.setInput('id', 'doc-1');
    fixture.detectChanges();
    await fixture.componentInstance.ready;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(api.requestArrayBuffer).toHaveBeenCalledWith('/api/designs/doc-1/mesh');
    const container: HTMLElement = fixture.nativeElement.querySelector('.stl-viewer');
    expect(container).toBeTruthy();
    expect(sceneFactory).toHaveBeenCalledWith(container, buffer);

    fixture.destroy();
    expect(dispose).toHaveBeenCalled();
  });

  it('shows a clear message when the design cannot be found', async () => {
    const api = {
      request: vi.fn().mockRejectedValue(new Error('Document not found.')),
      requestArrayBuffer: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: api }, provideRouter([])],
    });

    const fixture = TestBed.createComponent(DesignDetailPage);
    fixture.componentRef.setInput('id', 'missing');
    fixture.detectChanges();
    await fixture.componentInstance.ready;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Document not found.');

    fixture.destroy();
  });
});
