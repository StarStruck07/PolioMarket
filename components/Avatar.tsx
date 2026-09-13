import { avatarColor, initials } from "@/lib/tags";

export default function Avatar({
  name,
  size = 44,
  logo,
}: {
  name: string;
  size?: number;
  logo?: string | null;
}) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="avatar avatar-img"
        src={logo}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: avatarColor(name),
        fontSize: size * 0.4,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
