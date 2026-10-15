// Centers a DialogContent with insets + auto margins instead of top/left 50% and
// a -50% translate. The shared `dialog-in` keyframes also apply
// `transform: translate(-50%, -50%)` (fill-mode both) on top of Tailwind's
// `translate`, which shifts large dialogs off-screen; this layout does not
// depend on either, so it stays centred whether or not that is fixed.
export const CENTERED_DIALOG_CLASS = 'inset-0 m-auto translate-x-0 translate-y-0 data-[state=open]:animate-fade-in';
