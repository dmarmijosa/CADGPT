import { TestBed } from '@angular/core/testing';
import { App } from './app';
describe('App', () => {
  it('shows a real empty signed-out workspace, not fake devices', () => {
    TestBed.configureTestingModule({ imports: [App] });
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance.devices()).toEqual([]);
    expect(fixture.componentInstance.user()).toBe('');
    expect(fixture.componentInstance.model().confirmed).toBe(false);
  });
});
