Read `CLAUDE.md`before starting.

We're adding the design system and UI primitive components.

Install and configure `Tailwind` and `shadcn/ui`.

Add these shadcn components:
- Button
- Card
- Dialog
- Input
- Textarea
- Tabs
- ScrollArea
- Data Table
- Sonner
- Alert Dialog
- Badge
- Checkbox
- Combobox
- Spinner
- Switch
- Tooltip

Do not modify the generated `shared/ui/*` files after installation.

Also install `clsx tailwind-merge @ng-icons/core @ng-icons/lucide`.

Create `core/utils/tailwind.utils.ts`with a reusable `cn()' helper for merging Tailwind classes.

Ensure all components match the existing light and dark theme in `globals.scss`.

### Check when done

- All components import without errors.
- `cn()`works properly.