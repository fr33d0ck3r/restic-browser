import { core } from "@tauri-apps/api";
import { initTheme } from "./utils/theme-manager";


initTheme();


const oldDefine = customElements.define;
customElements.define = (
  name: string,
  construct: CustomElementConstructor,
  options?: ElementDefinitionOptions,
) => {
  try {
    return oldDefine.call(customElements, name, construct, options);
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.message.includes("has already been used with this registry")
    ) {
      return false;
    }
    throw error;
  }
};


document.addEventListener(
  "contextmenu",
  (e) => {
    e.preventDefault();
    return false;
  },
  { capture: true },
);


document.addEventListener("DOMContentLoaded", () => {
  core.invoke<void>("show_app_window");
});
