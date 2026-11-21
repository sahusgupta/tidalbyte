const paths = {
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
    </>
  ),
  ask: <path d="M4 4.5h16v12H10l-6 4v-16ZM8 9h8m-8 3.5h5" />,
  atlas: (
    <>
      <path d="m2 16 5-9 4 6 4-9 7 12-5 3-5-3-5 3z" />
      <path d="m5 15 2-3 4 6m4-9 4 7" />
    </>
  ),
  hurricane: (
    <>
      <path d="M20 8c-2-4-7-5-11-3-5 2-7 8-4 12m-1-2c3 5 9 6 13 3 4-3 5-8 2-12" />
      <circle cx="12" cy="12" r="3.8" />
    </>
  ),
  flood: (
    <>
      <path d="M2 10q3-4 6 0t6 0 7 0M2 15q3-4 6 0t6 0 7 0M2 20q3-4 6 0t6 0 7 0M12 2l-2 4a2 2 0 0 0 4 0z" />
    </>
  ),
  reset: (
    <>
      <path d="M3.5 10a8 8 0 1 1 1 7M3 4v6h6" />
    </>
  ),
  undo: (
    <>
      <path d="m8 5-5 5 5 5M4 10h10a6 6 0 0 1 6 6v2" />
    </>
  ),
  layers: (
    <>
      <path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  pin: (
    <>
      <path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z" />
      <circle cx="12" cy="9" r="2.3" />
    </>
  ),
  road: (
    <>
      <path d="m5 21 3-18m11 18L16 3M12 3v3m0 4v4m0 4v3" />
    </>
  ),
  book: (
    <>
      <path d="M3 5q5-2 9 1 5-3 9-1v14q-5-2-9 1-5-3-9-1zM12 6v14" />
    </>
  ),
  cursor: <path d="m5 3 14 10-7 1-3 6z" />,
  edit: (
    <>
      <path d="m4 16-1 5 5-1L21 7l-4-4zM14 6l4 4" />
    </>
  ),
  compare: (
    <>
      <path d="M12 3v18M3 7h6v10H3zM15 7h6v10h-6z" />
    </>
  ),
  play: <path d="m8 4 12 8-12 8z" />,
  pause: (
    <>
      <path d="M8 4v16m8-16v16" strokeWidth="4" />
    </>
  ),
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  closure: (
    <>
      <path d="M4 8h16v7H4zM5 20v-5m14 5v-5M5 13l4-4m3 4 4-4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
} as const;
export function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
