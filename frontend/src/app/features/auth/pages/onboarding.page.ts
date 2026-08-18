import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { apiErrorMessage } from '@app/core/api/http-error';
import { CheckinFrequency, FocusArea, OnboardingRequest } from '@app/models/auth.models';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Combobox,
  ComboboxOption,
  Input,
  Switch,
  Textarea,
  ToastService,
} from '@app/shared/ui';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-onboarding-page',
  imports: [
    ReactiveFormsModule,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Checkbox,
    Combobox,
    Input,
    Switch,
    Textarea,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen justify-center bg-bg-base p-4">
      <app-card class="my-8 w-full max-w-lg">
        <app-card-header>
          <app-card-title>A few questions to personalize Bright Day</app-card-title>
          <app-card-description>
            This helps us tailor your sessions. There are no right answers.
          </app-card-description>
        </app-card-header>
        <app-card-content>
          <form class="flex flex-col gap-6" [formGroup]="form" (ngSubmit)="submit()">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-text-primary" for="display_name">
                What should we call you?
              </label>
              <input appInput id="display_name" placeholder="Your name" formControlName="display_name" />
            </div>

            <div class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-text-primary">
                What would you most like to focus on?
              </span>
              <app-combobox
                [options]="focusOptions"
                [value]="primaryFocus()"
                (valueChange)="primaryFocus.set($event)"
                placeholder="Choose your main focus"
              />
            </div>

            <div class="flex flex-col gap-2">
              <span class="text-sm font-medium text-text-primary">
                Which areas matter to you right now?
              </span>
              @for (option of focusOptions; track option.value) {
                <label class="flex cursor-pointer items-center gap-3 text-sm text-text-primary">
                  <button
                    appCheckbox
                    type="button"
                    [checked]="isFocusSelected(option.value)"
                    (checkedChange)="toggleFocusArea(option.value, $event)"
                  ></button>
                  {{ option.label }}
                </label>
              }
            </div>

            <div class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-text-primary">
                How would you describe your stress lately?
              </span>
              <app-combobox
                [options]="stressOptions"
                [value]="currentStress()"
                (valueChange)="currentStress.set($event)"
                placeholder="Pick a level"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-text-primary">
                How often would you like to check in?
              </span>
              <app-combobox
                [options]="frequencyOptions"
                [value]="checkinFrequency()"
                (valueChange)="checkinFrequency.set($event)"
                placeholder="Choose a rhythm"
              />
            </div>

            <label class="flex items-center justify-between gap-3 text-sm text-text-primary">
              <span>Have you used wellbeing or journaling tools before?</span>
              <button
                appSwitch
                type="button"
                [checked]="usedToolsBefore()"
                (checkedChange)="usedToolsBefore.set($event)"
              ></button>
            </label>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-text-primary" for="goals_note">
                Anything else you'd like us to know? (optional)
              </label>
              <textarea
                appTextarea
                id="goals_note"
                rows="3"
                placeholder="A goal, a worry, or what a good outcome looks like for you"
                formControlName="goals_note"
              ></textarea>
            </div>

            <label class="flex items-start gap-3 text-sm text-text-muted">
              <button
                appCheckbox
                type="button"
                class="mt-0.5"
                [checked]="acknowledged()"
                (checkedChange)="acknowledged.set($event)"
              ></button>
              <span>
                I understand Bright Day is a wellbeing companion and does not replace
                professional medical or mental-health care.
              </span>
            </label>

            <button
              appButton
              type="submit"
              class="w-full"
              [loading]="submitting()"
              [disabled]="submitting()"
            >
              Finish setup
            </button>
          </form>
        </app-card-content>
      </app-card>
    </div>
  `,
})
export class OnboardingPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    display_name: ['', [Validators.required, Validators.maxLength(80)]],
    goals_note: ['', [Validators.maxLength(2000)]],
  });

  protected readonly primaryFocus = signal<string | null>(null);
  protected readonly currentStress = signal<string | null>(null);
  protected readonly checkinFrequency = signal<string | null>(null);
  protected readonly usedToolsBefore = signal(false);
  protected readonly acknowledged = signal(false);
  protected readonly selectedFocusAreas = signal<ReadonlySet<string>>(new Set());

  protected readonly focusOptions: ComboboxOption[] = [
    { label: 'Stress', value: 'stress' },
    { label: 'Anxiety', value: 'anxiety' },
    { label: 'Mood', value: 'mood' },
    { label: 'Sleep', value: 'sleep' },
    { label: 'Self-reflection', value: 'self_reflection' },
    { label: 'Relationships', value: 'relationships' },
    { label: 'Other', value: 'other' },
  ];

  protected readonly stressOptions: ComboboxOption[] = [
    { label: '1 — Very calm', value: '1' },
    { label: '2 — Calm', value: '2' },
    { label: '3 — Neutral', value: '3' },
    { label: '4 — Stressed', value: '4' },
    { label: '5 — Very stressed', value: '5' },
  ];

  protected readonly frequencyOptions: ComboboxOption[] = [
    { label: 'Every day', value: 'daily' },
    { label: 'A few times a week', value: 'few_times_week' },
    { label: 'Once a week', value: 'weekly' },
  ];

  protected isFocusSelected(value: string): boolean {
    return this.selectedFocusAreas().has(value);
  }

  protected toggleFocusArea(value: string, checked: boolean): void {
    this.selectedFocusAreas.update((set) => {
      const next = new Set(set);
      if (checked) {
        next.add(value);
      } else {
        next.delete(value);
      }
      return next;
    });
  }

  protected submit(): void {
    const focusAreas = [...this.selectedFocusAreas()];
    const primary = this.primaryFocus();
    const stress = this.currentStress();
    const frequency = this.checkinFrequency();

    if (
      this.form.invalid ||
      !primary ||
      !stress ||
      !frequency ||
      focusAreas.length === 0 ||
      !this.acknowledged()
    ) {
      this.form.markAllAsTouched();
      this.toast.error('Almost there', { description: 'A few answers are still missing.' });
      return;
    }

    this.submitting.set(true);
    const { display_name, goals_note } = this.form.getRawValue();
    const note = goals_note.trim();
    const body: OnboardingRequest = {
      display_name: display_name.trim(),
      primary_focus: primary as FocusArea,
      focus_areas: focusAreas as FocusArea[],
      current_stress: Number(stress),
      checkin_frequency: frequency as CheckinFrequency,
      used_wellbeing_tools_before: this.usedToolsBefore(),
      goals_note: note ? note : null,
      acknowledged_not_medical: this.acknowledged(),
    };

    this.auth.submitOnboarding(body).subscribe({
      next: () => {
        this.toast.success("You're all set");
        void this.router.navigateByUrl('/dashboard');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.toast.error('Could not save', { description: apiErrorMessage(err) });
      },
    });
  }
}
