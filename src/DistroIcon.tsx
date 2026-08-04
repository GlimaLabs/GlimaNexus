type Props = {
  osInfo?: string | null;
  size?: number;
};

function detect(osInfo?: string | null): string {
  const s = (osInfo ?? "").toLowerCase();
  if (s.includes("ubuntu")) return "ubuntu";
  if (s.includes("debian")) return "debian";
  if (s.includes("fedora")) return "fedora";
  if (s.includes("rocky")) return "rocky";
  if (s.includes("alma")) return "alma";
  if (s.includes("centos")) return "centos";
  if (s.includes("arch")) return "arch";
  if (s.includes("windows")) return "windows";
  return "generic";
}

export default function DistroIcon({ osInfo, size = 32 }: Props) {
  const distro = detect(osInfo);
  const style = { width: size, height: size, flexShrink: 0 };

  switch (distro) {
    case "ubuntu":
      return (
        <svg viewBox="0 0 100 100" style={style}>
          <circle cx="50" cy="50" r="48" fill="#2C001E" />
          <circle cx="50" cy="50" r="8" fill="#E95420" />
          <circle cx="50" cy="16" r="7" fill="#E95420" />
          <circle cx="21" cy="66" r="7" fill="#E95420" />
          <circle cx="79" cy="66" r="7" fill="#E95420" />
          <path d="M50 24 A26 26 0 0 1 71 63" fill="none" stroke="#E95420" strokeWidth="4" />
          <path d="M50 76 A26 26 0 0 1 27 42" fill="none" stroke="#E95420" strokeWidth="4" />
          <path d="M72 55 A26 26 0 0 1 34 71" fill="none" stroke="#E95420" strokeWidth="4" />
        </svg>
      );
    case "debian":
      return (
        <svg viewBox="0 0 100 100" style={style}>
          <circle cx="50" cy="50" r="48" fill="#A80030" />
          <path
            d="M55 20c-18 0-28 14-28 30 0 18 12 30 26 30-10-4-16-14-16-26 0-16 10-28 24-28 8 0 14 4 17 9-4-9-13-15-23-15z"
            fill="#fff"
          />
          <circle cx="66" cy="30" r="4" fill="#fff" />
        </svg>
      );
    case "fedora":
      return (
        <svg viewBox="0 0 100 100" style={style}>
          <circle cx="50" cy="50" r="48" fill="#294172" />
          <path
            d="M50 22a28 28 0 0 0-28 28v20a8 8 0 0 0 8 8h14a14 14 0 0 0 14-14V50a8 8 0 0 1 8-8h12V30a8 8 0 0 0-8-8z"
            fill="#fff"
          />
          <circle cx="38" cy="38" r="6" fill="#294172" />
        </svg>
      );
    case "centos":
      return (
        <svg viewBox="0 0 100 100" style={style}>
          <circle cx="50" cy="50" r="48" fill="#1a1a1a" />
          <rect x="50" y="20" width="26" height="26" fill="#932279" />
          <rect x="54" y="24" width="18" height="18" fill="#1a1a1a" />
          <rect x="24" y="20" width="26" height="26" fill="#EFA724" />
          <rect x="28" y="24" width="18" height="18" fill="#1a1a1a" />
          <rect x="50" y="54" width="26" height="26" fill="#9CCD2A" />
          <rect x="54" y="58" width="18" height="18" fill="#1a1a1a" />
          <rect x="24" y="54" width="26" height="26" fill="#262577" />
          <rect x="28" y="58" width="18" height="18" fill="#1a1a1a" />
        </svg>
      );
    case "rocky":
      return (
        <svg viewBox="0 0 100 100" style={style}>
          <circle cx="50" cy="50" r="48" fill="#10B981" />
          <path d="M30 70 L50 25 L70 70 Z" fill="#fff" />
          <path d="M42 70 L50 50 L58 70 Z" fill="#10B981" />
        </svg>
      );
    case "alma":
      return (
        <svg viewBox="0 0 100 100" style={style}>
          <circle cx="50" cy="50" r="48" fill="#0058A3" />
          <circle cx="50" cy="42" r="16" fill="#fff" />
          <path d="M30 78c4-14 12-20 20-20s16 6 20 20z" fill="#fff" />
        </svg>
      );
    case "arch":
      return (
        <svg viewBox="0 0 100 100" style={style}>
          <circle cx="50" cy="50" r="48" fill="#0f1115" />
          <path d="M50 18 L74 78 L58 78 L50 56 L42 78 L26 78 Z" fill="#1793D1" />
        </svg>
      );
    case "windows":
      return (
        <svg viewBox="0 0 100 100" style={style}>
          <circle cx="50" cy="50" r="48" fill="#0078D4" />
          <path d="M22 26 L48 22 L48 48 L22 51 Z" fill="#fff" />
          <path d="M52 21 L78 17 L78 48 L52 48 Z" fill="#fff" />
          <path d="M22 55 L48 55 L48 80 L22 76 Z" fill="#fff" />
          <path d="M52 55 L78 55 L78 83 L52 79 Z" fill="#fff" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 100 100" style={style}>
          <circle cx="50" cy="50" r="48" fill="#374151" />
          <circle cx="50" cy="40" r="14" fill="#e6edf3" />
          <path d="M30 78c4-16 12-24 20-24s16 8 20 24z" fill="#e6edf3" />
        </svg>
      );
  }
}
