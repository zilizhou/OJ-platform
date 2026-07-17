interface LogoProps {
  size?: number;
  showText?: boolean;
}

export default function Logo({ size = 28, showText = true }: LogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img
        src="/logo.png"
        alt="OJ Platform"
        width={size}
        height={size}
        style={{ display: 'block', borderRadius: 4 }}
        draggable={false}
      />
      {showText && (
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 18 }}>OJ Platform</span>
      )}
    </div>
  );
}
