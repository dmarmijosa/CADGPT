import { Component, input } from '@angular/core';

/**
 * Guarded stub for a single design. Bound from the `:id` route segment via
 * `withComponentInputBinding()`. The STL viewer (`GET /api/designs/:id`,
 * `GET /api/designs/:id/mesh`) lands in slice 8.
 */
@Component({
  selector: 'app-design-detail-page',
  templateUrl: './design-detail.html',
})
export class DesignDetailPage {
  readonly id = input<string>('');
}
