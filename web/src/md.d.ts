// React 19 sets these as properties on the element; onChange/onInput arrive via React's own events.
import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { MdFilledButton } from "@material/web/button/filled-button.js";
import type { MdCheckbox } from "@material/web/checkbox/checkbox.js";
import type { MdDialog } from "@material/web/dialog/dialog.js";
import type { MdFilterChip } from "@material/web/chips/filter-chip.js";
import type { MdInputChip } from "@material/web/chips/input-chip.js";
import type { MdIconButton } from "@material/web/iconbutton/icon-button.js";
import type { MdMenu } from "@material/web/menu/menu.js";
import type { MdMenuItem } from "@material/web/menu/menu-item.js";
import type { MdRadio } from "@material/web/radio/radio.js";
import type { MdFilledSelect } from "@material/web/select/filled-select.js";
import type { MdSelectOption } from "@material/web/select/select-option.js";
import type { MdSwitch } from "@material/web/switch/switch.js";
import type { MdPrimaryTab } from "@material/web/tabs/primary-tab.js";
import type { MdTabs } from "@material/web/tabs/tabs.js";
import type { MdFilledTextField } from "@material/web/textfield/filled-text-field.js";

type El<T extends HTMLElement = HTMLElement, P = object> = DetailedHTMLProps<HTMLAttributes<T>, T> & P;

interface ButtonProps {
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  trailingIcon?: boolean;
  href?: string;
  download?: string;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "md-filled-button": El<MdFilledButton, ButtonProps>;
      "md-filled-tonal-button": El<MdFilledButton, ButtonProps>;
      "md-outlined-button": El<MdFilledButton, ButtonProps>;
      "md-text-button": El<MdFilledButton, ButtonProps>;
      "md-icon-button": El<MdIconButton, { disabled?: boolean; type?: "button" | "submit" }>;
      "md-icon": El;
      "md-filled-text-field": El<
        MdFilledTextField,
        {
          label?: string;
          value?: string;
          type?: string;
          required?: boolean;
          disabled?: boolean;
          error?: boolean;
          errorText?: string;
          supportingText?: string;
          placeholder?: string;
          maxLength?: number;
          minLength?: number;
          rows?: number;
          autocomplete?: string;
          name?: string;
          noAsterisk?: boolean;
          min?: string;
          max?: string;
          step?: string;
        }
      >;
      "md-filled-select": El<
        MdFilledSelect,
        { label?: string; value?: string; disabled?: boolean; required?: boolean; menuPositioning?: "absolute" | "fixed" | "popover"; clampMenuWidth?: boolean; supportingText?: string }
      >;
      "md-select-option": El<MdSelectOption, { value?: string; selected?: boolean; disabled?: boolean }>;
      "md-switch": El<MdSwitch, { selected?: boolean; disabled?: boolean; icons?: boolean; showOnlySelectedIcon?: boolean }>;
      "md-checkbox": El<MdCheckbox, { checked?: boolean; disabled?: boolean; indeterminate?: boolean }>;
      "md-radio": El<MdRadio, { checked?: boolean; disabled?: boolean; name?: string; value?: string }>;
      "md-dialog": El<MdDialog, { open?: boolean; quick?: boolean }>;
      "md-tabs": El<MdTabs, { activeTabIndex?: number }>;
      "md-primary-tab": El<MdPrimaryTab, { active?: boolean; inlineIcon?: boolean }>;
      "md-chip-set": El;
      "md-assist-chip": El<HTMLElement, { label?: string; disabled?: boolean }>;
      "md-filter-chip": El<MdFilterChip, { label?: string; selected?: boolean; disabled?: boolean }>;
      "md-input-chip": El<MdInputChip, { label?: string; disabled?: boolean; onremove?: (e: Event) => void }>;
      "md-menu": El<MdMenu, { anchor?: string; positioning?: "absolute" | "fixed" | "document" | "popover"; anchorCorner?: string; menuCorner?: string; yOffset?: number }>;
      "md-menu-item": El<MdMenuItem, { selected?: boolean; disabled?: boolean }>;
      "md-divider": El<HTMLElement, { inset?: boolean }>;
      "md-circular-progress": El<HTMLElement, { indeterminate?: boolean; value?: number }>;
      "md-ripple": El<HTMLElement, { disabled?: boolean; htmlFor?: string }>;
      "md-focus-ring": El<HTMLElement, { inward?: boolean; htmlFor?: string }>;
    }
  }
}
