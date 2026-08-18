import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { lucideBrain, lucideBookOpen, lucideMic, lucideSmile } from '@ng-icons/lucide';

import { AuthStateService } from '@app/core/services/auth-state.service';
import { Badge, Card, buttonVariants } from '@app/shared/ui';

@Component({
  selector: 'app-home-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIconComponent, Badge, Card],
  providers: [provideIcons({ lucideMic, lucideBookOpen, lucideBrain, lucideSmile })],
  templateUrl: './home.page.html',
})
export class HomePage {
  protected readonly authState = inject(AuthStateService);
  protected readonly bv = buttonVariants;
}
