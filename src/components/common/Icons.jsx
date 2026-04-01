export default function Icon({ name, className = 'h-4 w-4', strokeWidth = 1.8 }) {
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'music':
      return <svg {...props}><path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
    case 'visuals':
      return <svg {...props}><circle cx="6" cy="12" r="2" /><circle cx="12" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><circle cx="18" cy="12" r="2" /><path d="M8 11l2-2M14 9l2 2M8 13l2 2M14 15l2-2" /></svg>;
    case 'analysis':
      return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
    case 'equalizer':
      return <svg {...props}><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-4" /><path d="M12 14V3" /><path d="M20 21v-9" /><path d="M20 9V3" /><path d="M2 10h4" /><path d="M10 14h4" /><path d="M18 9h4" /></svg>;
    case 'settings':
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 20.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V22a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 3.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 20.4 9c.26.3.43.65.5 1.04.07.39.02.79-.14 1.16" /></svg>;
    case 'headphones':
      return <svg {...props}><path d="M4 14v-2a8 8 0 1 1 16 0v2" /><rect x="3" y="13" width="4" height="7" rx="1" /><rect x="17" y="13" width="4" height="7" rx="1" /></svg>;
    case 'close':
      return <svg {...props}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
    case 'shuffle':
      return <svg {...props}><path d="m16 3 5 5-5 5" /><path d="M21 8H9a5 5 0 0 0-5 5v0" /><path d="m8 21-5-5 5-5" /><path d="M3 16h12a5 5 0 0 0 5-5v0" /></svg>;
    case 'prev':
      return <svg {...props}><path d="M6 6v12" /><path d="m18 6-8 6 8 6V6z" /></svg>;
    case 'next':
      return <svg {...props}><path d="M18 6v12" /><path d="m6 6 8 6-8 6V6z" /></svg>;
    case 'play':
      return <svg {...props}><path d="m8 5 11 7-11 7V5z" /></svg>;
    case 'pause':
      return <svg {...props}><path d="M9 5v14" /><path d="M15 5v14" /></svg>;
    case 'repeat':
      return <svg {...props}><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 23-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>;
    case 'repeat-one':
      return <svg {...props}><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 23-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /><path d="M11 15h2V9l-2 1" /></svg>;
    case 'volume-mute':
      return <svg {...props}><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></svg>;
    case 'volume-low':
      return <svg {...props}><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>;
    case 'volume-high':
      return <svg {...props}><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 6a9 9 0 0 1 0 12" /></svg>;
    case 'upload':
      return <svg {...props}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M20 16v4H4v-4" /></svg>;
    case 'brain':
      return <svg {...props}><path d="M9.5 3a3.5 3.5 0 0 0-3.5 3.5V9a3 3 0 0 0 0 6v2.5A3.5 3.5 0 0 0 9.5 21H10" /><path d="M14.5 3A3.5 3.5 0 0 1 18 6.5V9a3 3 0 0 1 0 6v2.5A3.5 3.5 0 0 1 14.5 21H14" /><path d="M10 7h4M10 12h4M10 17h4" /></svg>;
    case 'warning':
      return <svg {...props}><path d="m12 3 9 16H3L12 3z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>;
    case 'info':
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 10v6" /><path d="M12 7h.01" /></svg>;
    case 'diamond':
      return <svg {...props}><path d="m12 3 7 5-7 13L5 8l7-5z" /></svg>;
    case 'chart':
      return <svg {...props}><path d="M3 3v18h18" /><path d="m7 13 4-4 3 3 4-5" /></svg>;
    case 'guitar':
      return <svg {...props}><path d="m14 4 6 6" /><path d="m12 6 6 6" /><path d="M7 17a3 3 0 1 0 4 4l6-6-4-4-6 6z" /></svg>;
    case 'tool':
      return <svg {...props}><path d="m14.7 6.3 3 3" /><path d="m2 22 6-6" /><path d="m7 17 8.7-8.7a4 4 0 0 0-5.7-5.7L1.3 11.3a4 4 0 0 0 5.7 5.7z" /></svg>;
    case 'trash':
      return <svg {...props}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></svg>;
    case 'plug':
      return <svg {...props}><path d="M12 22v-5" /><path d="M9 7V3" /><path d="M15 7V3" /><path d="M5 11h14a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4z" /></svg>;
    case 'refresh':
      return <svg {...props}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>;
    case 'clipboard':
      return <svg {...props}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /></svg>;
    case 'disc':
      return <svg {...props}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></svg>;
    case 'file':
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>;
    case 'database':
      return <svg {...props}><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v6c0 1.66 3.13 3 7 3s7-1.34 7-3V5" /><path d="M5 11v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" /></svg>;
    case 'youtube':
      return <svg {...props}><rect x="3" y="6" width="18" height="12" rx="3" /><path d="m10 9 5 3-5 3V9z" /></svg>;
    case 'download':
      return <svg {...props}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M20 21H4" /></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="8" /></svg>;
  }
}