# Phase 18: GUI & UX Research Findings

**Researcher:** Kimi K2.5  
**Focus Area:** User Interface & User Experience Analysis  
**Date:** March 9, 2026

---

## Executive Summary

This analysis examines the GUI and UX patterns across the D&D Virtual Tabletop codebase. The application demonstrates a generally well-structured dark-themed UI with solid accessibility foundations, but several areas need improvement including inconsistent iconography, over-reliance on modals, small touch targets, and incomplete responsive design.

---

## 1. Interface User-Friendliness

### 1.1 Navigation Patterns

**Strengths:**
- Clear main menu structure (`MainMenuPage.tsx:1-153`) with descriptive labels and icons
- Consistent "back" button pattern across pages (`SettingsPage.tsx:480-498`)
- Breadcrumb-like navigation in library and settings

**Issues Identified:**

**Confusing Route Duplication**
- Character creation has duplicate routes: `/characters/create` vs `/characters/5e/create` (`App.tsx:165-179`)
- This creates confusion about which path to use and may lead to state inconsistencies

**Hidden Navigation Elements**
- Settings and Calendar are not accessible from the main menu navigation (`__Planning_Consolidated.md:233`)
- No in-app navigation to Library/Bastions/Calendar from active game session
- Users must return to main menu to access these features

**Tools Dropdown Complexity**
- The "Tools..." dropdown in `PlayerBottomBar.tsx:73-350` contains a long, nested list mixing combat, reference, and social actions
- Label is unclear - users don't know what to expect
- Missing categorization or grouping of related actions

### 1.2 Workflow Clarity

**DM Character Picker Confusion**
- `CharacterPickerOverlay` (`GameLayout.tsx:890-909`) requires DM to pick a character for player view
- Workflow is not obvious - no guidance or tutorial for first-time users
- No visual indication of current "view mode" status besides the toggle button

**Auto-Rejoin Loading State**
- `JoinGamePage.tsx:52-70` has no loading state feedback during reconnection
- Users see no visual indication that rejoin is in progress

**Bottom Bar Collapse Impact**
- Collapsing bottom bar (`GameLayout.tsx:116-123`) hides Macro Bar and Action Buttons
- Players lose core gameplay access when collapsed
- No persistent indicator that actions are hidden

### 1.3 Missing Onboarding
- No interactive tutorial for new users
- No guided first-character creation flow
- Help modal (`HelpModal.tsx`) is text-heavy and not contextual

---

## 2. Visual Polish & Design Language

### 2.1 Inconsistent Iconography

**Unicode Icons Instead of Consistent Library**
- Heavy use of Unicode characters (e.g., `&#9881;` for settings, `&#9876;` for error states)
- No consistent icon library (Lucide, Heroicons, or similar) implemented throughout
- Examples:
  - `SettingsDropdown.tsx:293` uses `&#9881;` (gear symbol)
  - `InGamePage.tsx:145` uses `&#9876;` (crossed swords)
  - `LeftSidebar.tsx:34-41` uses Unicode emoji for section icons

**Inconsistent Button Styling**
- Modal buttons use `text-[10px]` (`ModalFormFooter.tsx` pattern) - very small touch targets
- Should be at least `text-sm` per modern accessibility guidelines
- Multiple button size variants across components without systematic sizing scale

### 2.2 Typography Issues

**System Font Only**
- `globals.css:11` specifies only system fonts (`Segoe UI`, system-ui, -apple-system)
- No thematic/fantasy font option for D&D setting immersion
- Limited typographic hierarchy

**Excessive Use of 10px Font Size**
- 100+ occurrences of `text-[10px]` across the codebase
- Violates WCAG 2.1 guidelines for text readability
- Makes UI feel cramped and hard to read, especially for users with visual impairments
- Examples:
  - `SettingsPage.tsx:171, 200, 208, 217, 246, 303, 346, 377` and many more
  - `LibraryPage.tsx` uses it extensively for metadata

### 2.3 Color & Theme Consistency

**Dark UI Density Issues**
- `gray-800`/`gray-900` used everywhere (`__Planning_Consolidated.md:243`)
- Possible contrast issues, especially for users without high-quality displays
- Limited visual distinction between interactive and non-interactive elements

**Theme System**
- Four themes available: Dark, Parchment, High Contrast, Royal Purple (`SettingsPage.tsx:53-65`)
- Theme previews shown in settings but inconsistent application across components
- Some hardcoded colors bypass theme system

**Scrollbar Styling**
- Webkit-only scrollbar styling (`globals.css:24-39`)
- Firefox users see default system scrollbars, creating inconsistency

### 2.4 Animation & Micro-interactions

**Limited Animation**
- Only toasts and dice have animations (`globals.css:42-63`)
- No page transitions (instant map switching per `__Planning_Consolidated.md:17`)
- Limited micro-interactions for button states
- `prefers-reduced-motion` support exists but may not be comprehensive

**Focus Ring Animation**
- `globals.css:3-6` defines focus-visible outline
- No `prefers-reduced-motion` support in focus ring animation

---

## 3. Confusing Workflows & Unclear Labels

### 3.1 Modal Overload

**Screen-Blocking Modals**
- Heavy reliance on `GameModalDispatcher` (`GameLayout.tsx:912-939`) for most interactions
- Modals take players out of map context
- No inline/quick-edit patterns for common actions

**Compendium vs Library Confusion**
- Two separate mental models: `CompendiumModal` (in-game, read-only) and `LibraryPage` (full compendium)
- Different feature sets and rendering logic despite sharing data loaders
- Users may not understand which to use when

### 3.2 Unclear Labels

**Drawing Tools Icons**
- `GameLayout.tsx:832-870` uses Unicode symbols without text labels:
  - `✏️` for free draw
  - `📏` for line
  - `▭` for rectangle
  - `○` for circle
  - `📝` for text
- No tooltips on these buttons (missing `title` or `Tooltip` wrapper)

**Status Indicators**
- Many status badges lack clear visual distinction
- Plugin status badges use multiple colors that may not be colorblind-friendly
- `aiIsTyping` status is subtle and easy to miss

### 3.3 Missing Tooltips

**Insufficient Tooltip Coverage**
- Only 67 `aria-label` attributes across 697 TSX files
- Many interactive elements lack explanatory text
- `Tooltip` component exists (`Tooltip.tsx:1-93`) but is underutilized
- Tooltip visibility depends on accessibility store setting - may be disabled by default for some users

**Icon-Only Buttons Without Labels**
- Floor selector arrows
- Drawing toolbar buttons
- Many DM toolbar buttons rely on memory or discovery

---

## 4. Responsive Design & Screen Size Support

### 4.1 Game UI Not Responsive

**Fixed Layout Approach**
- `GameLayout.tsx` uses absolute positioning extensively (`absolute inset-0`, manual pixel calculations)
- "Z-index soup" with overlapping elements (`__Planning_Consolidated.md:100`)
- Manual `sidebarLeftPx` calculations for responsive positioning
- Map canvas assumes fixed aspect ratios

**Character Sheet Issues**
- Character sheet works on smaller screens but feels cramped
- No breakpoint-based layout adjustments
- Tables and grids don't reflow on narrow viewports

### 4.2 Missing Breakpoint Strategy

**No Tailwind Breakpoint Usage**
- No `sm:`, `md:`, `lg:` utility classes in key layout components
- Settings page uses single-column layout even on large screens (`max-w-3xl` only)
- Library page grid doesn't adapt to viewport width

**Touch Target Sizes**
- Many buttons fall below 44x44px minimum for touch
- `text-[10px]` buttons are particularly problematic on mobile
- Drawing toolbar buttons are only 40x40px (`w-10 h-10`)

### 4.3 Collapsible UI Issues

**Bottom Bar Collapse**
- Collapsed state (`bottomCollapsed: true`) leaves only 40px height
- Toggle button is small and may be missed
- No visual preview of what content is hidden

**Sidebar Collapse**
- Collapses to 48px width (`LeftSidebar.tsx`)
- Section icons become the only navigation
- No hover preview of section names when collapsed

---

## 5. Design Language Consistency

### 5.1 Inconsistent Component Usage

**Modal Implementation Fragmentation**
- `Modal.tsx` - Full-featured with focus trap, escape handling, aria attributes
- `CompendiumModal` and `LibraryDetailModal` don't use shared `Modal` component
- `NarrowModalShell` exists for specific use cases
- Missing consistent modal sizing guidelines

**Card Component Usage**
- `Card.tsx` exists but many cards use inline styling
- Character cards, NPC cards, and item cards all have different styling approaches
- No unified card elevation/border-radius system

**Button Variants**
- `Button.tsx` defines primary, secondary, danger, ghost variants
- Many buttons use inline Tailwind instead of Button component
- Inconsistent hover states across the app

### 5.2 Color Scheme Inconsistencies

**Dice Tray Styling**
- Dice tray has different styling from main UI (`__Planning_Consolidated.md:250`)
- 3D dice overlay may not match current theme
- Color picker in settings doesn't affect all UI elements

**Status Colors**
- Success: `green-400`, `green-600`, `amber-400` (inconsistent)
- Error: `red-400`, `red-600`, `red-700` (varies by component)
- Warning: `amber-400`, `yellow-400` (no clear distinction)

**Semantic Color Usage**
- Health bars should use semantic colors (green/yellow/red based on percentage)
- Currently not consistently implemented across character sheets

### 5.3 Spacing & Layout Inconsistencies

**Padding Variations**
- `p-2`, `p-3`, `p-4`, `p-5` all used without systematic spacing scale
- Gap values vary: `gap-2`, `gap-3`, `gap-4` without clear rationale
- Margins are inconsistently applied

**Border Radius**
- `rounded`, `rounded-lg`, `rounded-xl` used inconsistently
- Some elements use `rounded-full` for circular buttons
- No design token system for consistent corner rounding

---

## 6. Loading, Empty & Error States

### 6.1 Loading States

**Spinner Component**
- `Spinner.tsx` - Clean implementation with `role="status"` and `aria-label="Loading"`
- Three sizes available (sm, md, lg)
- Used consistently in suspense fallbacks

**Skeleton Loading**
- `Skeleton.tsx` provides animated placeholder with proper ARIA attributes
- Limited to `lines` prop - no image or card skeletons
- Not widely adopted across data-loading components

**Loading State Issues**
- Many data fetches (e.g., `LibraryPage.tsx:154-167`) don't show loading states
- Global search (`searchAllCategories`) has loading flag but minimal UI feedback
- AI DM response loading is subtle (`aiIsTyping` boolean only)

### 6.2 Empty States

**EmptyState Component**
- `EmptyState.tsx` - Basic implementation with icon, title, and description
- Used in some lists but not consistently
- Many lists show blank screens when empty

**Missing Empty States**
- Initiative tracker when no entries
- Combat log when no events
- Shop when no items
- Character inventory sections

### 6.3 Error State Handling

**Graceful Degradation**
- `ErrorBoundary` component exists (`ErrorBoundary.tsx`)
- Used in route-level (`App.tsx:153-274`) and modal-level (`ModalErrorBoundary.tsx`)
- Some error states show inline messages, others use toasts

**Error State Issues**
- `CreatureSearchModal.tsx:29-30` - Loading failures show empty results without error message
- Network errors in `JoinGamePage.tsx` have no visual feedback during auto-rejoin
- Library data load failures (`LibraryPage.tsx:158-163`) show toast but UI remains in loading state

**Toast System**
- Toast notifications provide feedback but can be missed
- No persistent error log for users to review
- Some errors use `console.error` instead of user-visible notifications

---

## 7. Accessibility Improvements Needed

### 7.1 Existing Accessibility Features

**Screen Reader Support**
- `ScreenReaderAnnouncer.tsx` - Global live region for announcements
- `announce()` function available for programmatic announcements
- Disabled by default (`screenReaderMode: false` in accessibility store)

**Skip to Content**
- `SkipToContent.tsx` - Visually-hidden skip link that appears on focus
- Properly implemented accessibility pattern

**Colorblind Support**
- `ColorblindFilters.tsx` - SVG filters for deuteranopia, protanopia, tritanopia
- Four colorblind modes available in settings
- Filters applied via CSS `filter: url(#filter-id)`

**Focus Management**
- `Modal.tsx` implements focus trap with Tab/Shift+Tab handling
- Focus returns to trigger element on modal close
- `focus-visible` ring defined in global styles

**ARIA Attributes**
- 67 instances of `aria-label` across codebase
- Some `aria-live` regions for dynamic content
- `role="dialog"`, `role="status"` used appropriately in some components

### 7.2 Critical Accessibility Gaps

**Missing ARIA Labels**
- 697 TSX files but only 67 `aria-label` attributes
- Many icon-only buttons lack accessible names
- Interactive map elements (tokens, grid cells) lack proper labeling

**ARIA Expanded Missing**
- Collapsible sections (sidebar, dropdowns) lack `aria-expanded` attributes
- Accordions don't communicate state to screen readers
- Settings dropdown, tool sections need expansion state

**Focus Management Issues**
- `CompendiumModal` and `LibraryDetailModal` don't use shared `Modal` component
- Missing focus trap in these custom modals
- Escape key handling inconsistent

**Reduced Motion**
- `reducedMotion` setting exists in accessibility store
- Not comprehensively applied to all animations
- Focus ring animation lacks `prefers-reduced-motion` support

**Color Contrast**
- Dark gray on darker gray may fail WCAG contrast requirements
- `gray-400` on `gray-800` needs verification
- Amber accent on dark backgrounds generally good but some combinations may fail

**Screen Reader Mode**
- Must be manually enabled in Settings
- Not auto-detected based on system preferences
- Many users who need it won't know to enable it

### 7.3 Keyboard Navigation Issues

**Tab Order**
- Drawing toolbar (`GameLayout.tsx:832-870`) may not have logical tab order
- Modal focus traps work but may trap in unexpected ways
- No skip navigation for complex panels

**Keyboard Shortcuts**
- Keyboard shortcuts exist (`?` to show overlay)
- Not all actions have keyboard equivalents
- Custom keybinding editor available but complex to use

---

## 8. Specific Component UX Issues

### 8.1 Game Layout Complexity

**State Overload**
- `GameLayout.tsx` holds 50+ pieces of state
- Should extract into dedicated hooks for maintainability
- State management complexity affects performance and UX

**Z-Index Management**
- Hardcoded z-index values throughout: `z-10`, `z-20`, `z-40`, `z-50`, `z-[60]`, `z-[9999]`
- No systematic layering strategy
- Potential for elements to overlap incorrectly

### 8.2 Initiative Tracker

**Visual Feedback**
- `InitiativeOverlay.tsx` and `InitiativeControls.tsx` provide basic functionality
- No auto-sort when initiative values change
- Current turn highlighting exists but could be more prominent

**Missing Features**
- No delayed turn visual indicator (UI removes entries; slice methods separate)
- No group initiative support
- Initiative identity lost when created from map tokens

### 8.3 Token Interactions

**Token Context Menu**
- `TokenContextMenu.tsx` provides right-click options
- `handleApplyCondition` closes menu but no link to `QuickConditionModal`
- Missing quick actions for common operations

**Token Selection**
- Single-token selection only
- No multi-select for group operations
- No visual feedback for selection state

### 8.4 Map Interface

**Floor Selector**
- `FloorSelector.tsx` exists but `currentFloor` state is never used for token visibility
- Floors are decorative only
- No clear visual indication of current floor

**Drawing Tools**
- Drawing tools only available in `DMMapEditor`, not main game toolbar
- Users can't annotate maps during gameplay

---

## 9. Recommendations Summary

### High Priority

1. **Replace Unicode icons with consistent icon library** (Lucide or Heroicons)
2. **Increase minimum font size from 10px to 14px** throughout
3. **Add comprehensive aria-labels** to all interactive elements
4. **Implement responsive breakpoints** for tablet and mobile support
5. **Create consistent empty states** for all data-dependent views

### Medium Priority

6. **Unify modal system** - ensure all modals use shared Modal component
7. **Add tooltips to all icon-only buttons**
8. **Implement proper loading skeletons** for data-heavy components
9. **Improve error state visibility** with inline messages and retry options
10. **Add `prefers-reduced-motion` support** to all animations

### Lower Priority

11. **Create onboarding tutorial** for first-time users
12. **Add theme-aware dice tray styling**
13. **Implement breadcrumb navigation** for deep pages
14. **Add keyboard shortcut hints** in UI
15. **Create consistent spacing/design token system**

---

## 10. Positive UX Findings

1. **Accessibility Foundation** - Good groundwork with screen reader support, colorblind modes, and keyboard navigation
2. **Toast Notification System** - Clean, non-intrusive feedback (`Toast.tsx`)
3. **Theme System** - Multiple themes with proper switching mechanism
4. **Modal Focus Management** - Proper focus trapping in shared Modal component
5. **Loading States** - Spinner and Skeleton components available and used
6. **Settings Persistence** - User preferences saved to localStorage
7. **Keyboard Shortcuts** - Global shortcut system with customization
8. **Error Boundaries** - Proper error containment at route and component levels

---

*End of Phase 18 Research Findings*
