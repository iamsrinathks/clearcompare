import { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </svg>
);
export const IconSessions = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
export const IconAll = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 4v16M4 12h16M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconDiffs = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 9h14M5 15h14M16 4l-8 16" />
  </svg>
);
export const IconSame = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 9h14M5 15h14" />
  </svg>
);
export const IconContext = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 12h8M12 8v8" />
  </svg>
);
export const IconMinor = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 9c2-2 4-2 6 0s4 2 6 0M4 15c2-2 4-2 6 0s4 2 6 0" />
  </svg>
);
export const IconRules = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="9" cy="7" r="3" />
    <path d="M3 20c0-3 3-5 6-5M14 6h6M14 10h6M14 14h4M14 18h4" />
  </svg>
);
export const IconFormat = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 12h10M4 18h16" />
    <circle cx="18" cy="12" r="1.6" />
  </svg>
);
export const IconCopyRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 12h12M12 7l5 5-5 5" />
    <path d="M20 5v14" />
  </svg>
);
export const IconCopyLeft = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M20 12H8M12 7l-5 5 5 5" />
    <path d="M4 5v14" />
  </svg>
);
export const IconNext = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);
export const IconPrev = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
export const IconSwap = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 4L3 8l4 4" />
    <path d="M3 8h14" />
    <path d="M17 20l4-4-4-4" />
    <path d="M21 16H7" />
  </svg>
);
export const IconStop = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);
export const IconHash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />
  </svg>
);
export const IconSplitH = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16" />
  </svg>
);
export const IconSplitV = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 12h18" />
  </svg>
);
export const IconReload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M20 11a8 8 0 1 0-2 6" />
    <path d="M20 4v6h-6" />
  </svg>
);
export const IconSave = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7M8 20v-6h8v6" />
  </svg>
);
