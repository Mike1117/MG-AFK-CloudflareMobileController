import "./styles.css";
import { MobileController } from "./app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("App root is missing.");
const controller = new MobileController(root);
void controller.start();
window.addEventListener("pagehide", () => controller.dispose(), { once: true });
