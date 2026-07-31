import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The Nym mark: an empty outline square behind, the inked tile in front.
 *
 * It reads as one name standing in for another — the understudy idea the brand
 * was chosen for. Purely decorative; the wordmark beside it carries the name.
 */
@Component({
  selector: 'nym-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './logo.html',
  styleUrl: './logo.css',
})
export class LogoComponent {}
