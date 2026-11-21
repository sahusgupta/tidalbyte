/** Keep a connected external simulator modal usable with a keyboard. */
export function manageDialogFocus(
  dialog: HTMLElement,
  heading: HTMLElement,
  modal: boolean,
): () => void {
  const previous =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const inertSiblings: { element: HTMLElement; inert: boolean }[] = [];
  if (modal) {
    let branch: HTMLElement = dialog;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          inertSiblings.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
  }
  const controls = () =>
    [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], iframe, input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
      ),
    ].filter(
      (element) =>
        element.getClientRects().length > 0 && !element.closest("[inert]"),
    );
  const contain = (event: FocusEvent) => {
    if (modal && event.target instanceof Node && !dialog.contains(event.target))
      (controls()[0] ?? heading).focus();
  };
  const tab = (event: KeyboardEvent) => {
    if (!modal || event.key !== "Tab") return;
    const items = controls();
    const active = document.activeElement;
    if (event.shiftKey && (active === items[0] || active === heading)) {
      event.preventDefault();
      (items.at(-1) ?? heading).focus();
    } else if (
      !event.shiftKey &&
      (active === items.at(-1) || !dialog.contains(active))
    ) {
      event.preventDefault();
      (items[0] ?? heading).focus();
    }
  };
  document.addEventListener("focusin", contain);
  document.addEventListener("keydown", tab);
  heading.focus();
  return () => {
    document.removeEventListener("focusin", contain);
    document.removeEventListener("keydown", tab);
    for (const sibling of inertSiblings) sibling.element.inert = sibling.inert;
    if (previous?.isConnected && !dialog.contains(previous)) previous.focus();
  };
}
