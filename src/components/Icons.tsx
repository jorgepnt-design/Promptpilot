import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 20, ...rest }: P) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...rest,
  }
}

export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
)

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconStar = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3.6 2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />
  </svg>
)

export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
  </svg>
)

export const IconEdit = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4 16.5z" />
    <path d="m14.5 6.5 3 3" />
  </svg>
)

export const IconMore = (p: P) => (
  <svg {...base(p)}>
    <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)

export const IconLibrary = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="7" height="16" rx="2" />
    <rect x="14" y="4" width="7" height="9" rx="2" />
    <path d="M14 17h7" />
  </svg>
)

export const IconCollections = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2l1.6 2H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5z" />
  </svg>
)

export const IconSettings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5 16.8 7.2M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
  </svg>
)

export const IconArchive = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="4.5" rx="1.5" />
    <path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5M10 13h4" />
  </svg>
)

export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 6.5h16M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" />
  </svg>
)

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
)

export const IconFilter = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 6h17M6.5 12h11M10 18h4" />
  </svg>
)

export const IconLink = (p: P) => (
  <svg {...base(p)}>
    <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
    <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
  </svg>
)

export const IconTemplate = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M9 9.5v10" />
  </svg>
)

export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </svg>
)

export const IconUpload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20V9M7.5 13.5 12 9l4.5 4.5M5 4.5h14" />
  </svg>
)

export const IconDuplicate = (p: P) => (
  <svg {...base(p)}>
    <rect x="8" y="8" width="12" height="12" rx="2.5" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
)

export const IconRestore = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5A8 8 0 1 1 4.6 15" />
    <path d="M3.5 4.5V10H9" />
  </svg>
)

export const IconCloud = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 18.5a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6 1.2A3.65 3.65 0 0 1 17 18.5z" />
  </svg>
)

export const IconStack = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 3.5 8.5 4.2-8.5 4.3-8.5-4.3z" />
    <path d="m4 12.3 8 4 8-4M4 16.5l8 4 8-4" />
  </svg>
)

export const IconImage = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="8.75" cy="9.75" r="1.5" />
    <path d="m4.5 17 4.8-4.6a1.6 1.6 0 0 1 2.2 0l3 2.9m0 0 1.6-1.5a1.6 1.6 0 0 1 2.2 0l1.2 1.1m-5 .4 3.9 3.7" />
  </svg>
)

export const IconGrid = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </svg>
)

export const IconRows = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="4" rx="1.6" />
    <rect x="4" y="15" width="16" height="4" rx="1.6" />
  </svg>
)

export const IconHistory = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 10a7.8 7.8 0 1 1 .8 5" />
    <path d="M4 4.8V10h5.2M12 8.2V12l2.8 1.8" />
  </svg>
)

/** Das App-Logo als Vektor – gleiche Formensprache und Farbwelt wie das PNG-Symbol. */
export function LogoMark({ size = 32, rounded = 9 }: { size?: number; rounded?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="PromptPilot"
      style={{ borderRadius: rounded, display: 'block' }}
    >
      <defs>
        <linearGradient id="pp-grad" x1="10" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7FE9FF" />
          <stop offset="0.45" stopColor="#4C7DFF" />
          <stop offset="1" stopColor="#B570F8" />
        </linearGradient>
        <linearGradient id="pp-grad-2" x1="12" y1="12" x2="34" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#42D7FF" />
          <stop offset="1" stopColor="#3B6BF5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="0" fill="#030C31" />
      <path
        d="M22.5 12.5 33 15.5 26 53l-9.5-2.6a3 3 0 0 1-2.2-3.6l6-31.2a3 3 0 0 1 2.2-3.1z"
        fill="url(#pp-grad-2)"
        opacity="0.92"
      />
      <path
        d="M25.5 9.5h17.2c8.2 0 13.8 5.9 13.8 13.6 0 8.2-6 13.9-14.6 13.9h-6.7l-2 13.6a3 3 0 0 1-3 2.6h-6.4a3 3 0 0 1-3-3.4l6.7-37.7a3 3 0 0 1 3-2.6zm6.9 12.9-1.2 8.2 12.6-4.1z"
        fill="url(#pp-grad)"
      />
    </svg>
  )
}
