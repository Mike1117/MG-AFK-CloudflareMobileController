export type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string; attrs?: Record<string, string>; on?: Record<string, EventListener> } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) node.setAttribute(name, value);
  for (const [name, listener] of Object.entries(options.on ?? {})) node.addEventListener(name, listener);
  for (const child of children) if (child) node.append(child);
  return node;
}

export function button(text: string, action: () => void, className = "button"): HTMLButtonElement {
  return el("button", { className, text, attrs: { type: "button" }, on: { click: action } });
}

export function labeledToggle(label: string, checked: boolean, change: (checked: boolean) => void): HTMLElement {
  const input = el("input", { attrs: { type: "checkbox", role: "switch", "aria-label": label } });
  input.checked = checked;
  input.addEventListener("change", () => change(input.checked));
  return el("label", { className: "toggle-row" }, input, el("span", { className: "toggle-track" }), el("span", { text: label }));
}

export function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return el("label", { className: "field" }, el("span", { className: "field-label", text: label }), input,
    hint ? el("span", { className: "field-hint", text: hint }) : null);
}
