/**
 * Creates a simple color picker (swatch only, no extra inputs).
 * The native OS color picker already provides hex/RGB switching.
 */
export interface ColorPickerOpts {
  container: HTMLElement;
  value: string;
  onChange: (hex: string) => void;
  cls?: string;
}

export function createColorPicker(opts: ColorPickerOpts): { setValue: (hex: string) => void } {
  const swatch = opts.container.createEl("input", { cls: `ttrpgmap-color-swatch ${opts.cls ?? ""}` });
  swatch.type = "color";
  swatch.value = opts.value;
  swatch.addEventListener("input", () => opts.onChange(swatch.value));

  return {
    setValue: (hex: string) => { swatch.value = hex; },
  };
}
