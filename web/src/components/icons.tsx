import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function Icon({ size = 20, className = "", children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </Icon>
);

export const SoundOnIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </Icon>
);

export const SoundOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4z" />
    <path d="M17 9l5 6M22 9l-5 6" />
  </Icon>
);

/** Six-armed snowflake: the wax seal's stamp and the card's monogram. */
export const SnowflakeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2v20M3.34 7l17.32 10M3.34 17l17.32-10" />
    <path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5M6.1 5.6 6.8 9l-3.2.9M17.9 5.6 17.2 9l3.2.9M3.6 14.1l3.2.9-.7 3.4M20.4 14.1l-3.2.9.7 3.4" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
