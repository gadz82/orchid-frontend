/**
 * Orchid flower icon — stylized SVG used throughout the app.
 * Renders a simplified orchid bloom with three petals and a center.
 */

interface OrchidIconProps {
    className?: string;
    size?: number;
}

export function OrchidIcon({className = "", size = 24}: OrchidIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Center petal (top) */}
            <path
                d="M12 2C10.5 5 9.5 7.5 12 11C14.5 7.5 13.5 5 12 2Z"
                fill="currentColor"
                opacity="0.9"
            />
            {/* Left petal */}
            <path
                d="M4 8C6.5 7.5 9 8 11 11C7.5 11.5 5.5 10.5 4 8Z"
                fill="currentColor"
                opacity="0.7"
            />
            {/* Right petal */}
            <path
                d="M20 8C17.5 7.5 15 8 13 11C16.5 11.5 18.5 10.5 20 8Z"
                fill="currentColor"
                opacity="0.7"
            />
            {/* Bottom-left petal */}
            <path
                d="M6 18C7.5 15.5 9.5 13.5 12 13C9 14.5 7 16 6 18Z"
                fill="currentColor"
                opacity="0.55"
            />
            {/* Bottom-right petal */}
            <path
                d="M18 18C16.5 15.5 14.5 13.5 12 13C15 14.5 17 16 18 18Z"
                fill="currentColor"
                opacity="0.55"
            />
            {/* Stem */}
            <path
                d="M12 13L12 22"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.5"
            />
            {/* Center dot */}
            <circle cx="12" cy="11.5" r="1.5" fill="currentColor" opacity="1"/>
        </svg>
    );
}
