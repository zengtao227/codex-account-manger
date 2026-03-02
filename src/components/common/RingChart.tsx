interface RingChartProps {
    percent: number; // 0-100
    size?: number;
    strokeWidth?: number;
    label: string;
    sublabel?: string;
}

function getColor(percent: number): string {
    if (percent < 60) return '#10B981';
    if (percent < 80) return '#F59E0B';
    return '#EF4444';
}

export function RingChart({ percent, size = 100, strokeWidth = 8, label, sublabel }: RingChartProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    const color = getColor(percent);

    return (
        <div className="usage-ring-wrap">
            <div style={{ position: 'relative', width: size, height: size }}>
                <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                    {/* Track */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="var(--bg-card)"
                        strokeWidth={strokeWidth}
                    />
                    {/* Progress */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        style={{
                            transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1), stroke 0.3s',
                            filter: `drop-shadow(0 0 6px ${color}60)`,
                        }}
                    />
                </svg>
                {/* Center text */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <div className="usage-ring-value" style={{ color, fontSize: size < 90 ? '16px' : '22px' }}>
                        {percent}%
                    </div>
                </div>
            </div>
            <div className="usage-ring-label">{label}</div>
            {sublabel && <div className="usage-ring-sub">{sublabel}</div>}
        </div>
    );
}
