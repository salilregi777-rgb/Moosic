import logoAsset from '@assets/moodsic-references/moosic-logo.png';

type AnimatedLogoProps = {
  className?: string;
  testId?: string;
};

/** Decorative brand mark; keep the visible MOOSIC wordmark beside it. */
export function AnimatedLogo({ className = '', testId }: AnimatedLogoProps) {
  return (
    <span className={`brand-mark moosic-logo ${className}`.trim()} aria-hidden="true">
      <span className="moosic-logo__orbit" />
      <span className="moosic-logo__portrait">
        <img src={logoAsset} alt="" draggable={false} data-testid={testId} />
      </span>
      <svg className="moosic-logo__note moosic-logo__note--left" viewBox="0 0 16 20" fill="currentColor" focusable="false">
        <path d="M6 3.5 15 1v12.1c0 2-2.3 3.7-4.5 3.7-1.5 0-2.5-.8-2.5-2 0-2 2.4-3.7 4.7-3.6V5L8 6.3v9.1C8 17.5 5.7 19 3.5 19 2 19 1 18.2 1 17c0-2 2.4-3.7 5-3.6V3.5Z" />
      </svg>
      <svg className="moosic-logo__note moosic-logo__note--right" viewBox="0 0 12 20" fill="currentColor" focusable="false">
        <path d="M7 1v12.4C4.5 13.1 1 15 1 17.2 1 18.4 2 19 3.5 19 6 19 9 17.2 9 15V6.2c1.6.8 2.5 2 2.5 3.8C13 5.6 9.5 4.1 9 1H7Z" />
      </svg>
    </span>
  );
}
