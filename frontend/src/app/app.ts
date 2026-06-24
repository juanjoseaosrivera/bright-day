import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Toaster } from '@app/shared/ui';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toaster],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
