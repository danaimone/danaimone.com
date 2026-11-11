const COPIED_MS = 2400;

export async function copyEmail(email: string, label: HTMLElement) {
  try {
    await navigator.clipboard.writeText(email);
    label.textContent = "Copied";
    setTimeout(() => (label.textContent = "Copy email"), COPIED_MS);
  } catch {
    window.location.href = `mailto:${email}`;
  }
}
