import type { SubtitleAssLayout } from '@project/common';

// Draws ASS typeset signs where the script places them. The container the signs go in must cover exactly the
// area where the video picture is shown and set `container-type: size`, because positions are percentages of it
// and sizes are in `cqh` (percent of its height).

export const ASB_ASS_SIGN_CLASS = 'asbplayer-ass-sign';
const indexAttribute = 'data-asb-ass-index';
const moveAttribute = 'data-asb-ass-move';
const fadeAttribute = 'data-asb-ass-fade';

// libass sizes fonts so that ascent plus descent equals \fs; for common fonts that is about 0.85 em.
const fontSizeToEm = 0.85;

const percent = (fraction: number) => `${Number((fraction * 100).toFixed(4))}%`;
const cqh = (fraction: number) => `${Number((fraction * 100).toFixed(4))}cqh`;

const escapeAttribute = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const outlineShadow = (color: string, width: number) => {
    if (width <= 0) return 'none';
    const directions = [
        [1, 0],
        [0.7071, 0.7071],
        [0, 1],
        [-0.7071, 0.7071],
        [-1, 0],
        [-0.7071, -0.7071],
        [0, -1],
        [0.7071, -0.7071],
    ];
    return directions.map(([x, y]) => `${cqh(x * width)} ${cqh(y * width)} 0 ${color}`).join(', ');
};

/**
 * HTML for one sign. `html` is the subtitle's already sanitized text. `index` identifies the subtitle so that
 * {@link syncAssSignAnimations} can find its timing.
 */
export const assSignHtml = (html: string, layout: SubtitleAssLayout, index: number) => {
    const column = (layout.alignment - 1) % 3; // 0 left, 1 center, 2 right
    const row = Math.floor((layout.alignment - 1) / 3); // 0 bottom, 1 middle, 2 top
    const anchorX = column * 50;
    const anchorY = [100, 50, 0][row];
    const textAlign = ['left', 'center', 'right'][column];
    const move = layout.move
        ? ` ${moveAttribute}="${[layout.move.x, layout.move.y, layout.move.start, layout.move.end].join(',')}"`
        : '';
    const fade =
        layout.fadeIn !== undefined || layout.fadeOut !== undefined
            ? ` ${fadeAttribute}="${layout.fadeIn ?? 0},${layout.fadeOut ?? 0}"`
            : '';
    const fontFamily = layout.fontFamily ? `"${layout.fontFamily}", sans-serif` : 'sans-serif';
    const textStyle = [
        'position:absolute',
        'left:0',
        'top:0',
        'white-space:pre',
        'line-height:1.15',
        'pointer-events:auto',
        `text-align:${textAlign}`,
        `transform-origin:${anchorX}% ${anchorY}%`,
        `transform:translate(-${anchorX}%, -${anchorY}%) rotate(${-layout.rotation}deg) scale(${layout.scaleX}, ${layout.scaleY})`,
        `font-family:${fontFamily}`,
        `font-size:${cqh(layout.fontSize * fontSizeToEm)}`,
        `font-weight:${layout.bold ? 700 : 400}`,
        `font-style:${layout.italic ? 'italic' : 'normal'}`,
        `color:${layout.color}`,
        `text-shadow:${outlineShadow(layout.outlineColor, layout.outlineWidth)}`,
    ].join(';');

    return (
        `<div class="${ASB_ASS_SIGN_CLASS}" ${indexAttribute}="${index}"${move}${fade} ` +
        `style="position:absolute;left:${percent(layout.x)};top:${percent(layout.y)};width:0;height:0;">` +
        `<div class="${ASB_ASS_SIGN_CLASS}-text" style="${escapeAttribute(textStyle)}">${html}</div></div>`
    );
};

interface SignTiming {
    start: number;
    end: number;
}

const signAnimations = new WeakMap<Element, Animation[]>();

const createAnimations = (sign: HTMLElement, timing: SignTiming) => {
    const duration = Math.max(1, timing.end - timing.start);
    const animations: Animation[] = [];
    const options: KeyframeAnimationOptions = { duration, fill: 'both', easing: 'linear' };
    const offset = (ms: number) => Math.min(1, Math.max(0, ms / duration));

    const move = sign.getAttribute(moveAttribute)?.split(',').map(Number);
    if (move && move.length === 4 && move.every(Number.isFinite)) {
        const [x, y, moveStart, moveEnd] = move;
        const from = { left: sign.style.left, top: sign.style.top };
        const to = { left: percent(x), top: percent(y) };
        animations.push(
            sign.animate(
                [
                    { ...from, offset: 0 },
                    { ...from, offset: offset(moveStart) },
                    { ...to, offset: Math.max(offset(moveStart), offset(moveEnd)) },
                    { ...to, offset: 1 },
                ],
                options
            )
        );
    }

    const fade = sign.getAttribute(fadeAttribute)?.split(',').map(Number);
    const text = sign.firstElementChild;
    if (fade && fade.length === 2 && fade.every(Number.isFinite) && text instanceof HTMLElement) {
        const [fadeIn, fadeOut] = fade;
        const visibleFrom = offset(fadeIn);
        const visibleUntil = Math.max(visibleFrom, offset(duration - fadeOut));
        animations.push(
            text.animate(
                [
                    { opacity: fadeIn > 0 ? 0 : 1, offset: 0 },
                    { opacity: 1, offset: visibleFrom },
                    { opacity: 1, offset: visibleUntil },
                    { opacity: fadeOut > 0 ? 0 : 1, offset: 1 },
                ],
                options
            )
        );
    }

    return animations;
};

/**
 * Moves and fades the signs under `root` to match the video. Call it after the signs are rendered and whenever the
 * video seeks, pauses, resumes or changes speed.
 */
export const syncAssSignAnimations = (
    root: ParentNode,
    currentTimeMs: number,
    paused: boolean,
    playbackRate: number,
    timingOf: (index: number) => SignTiming | undefined
) => {
    for (const sign of root.querySelectorAll<HTMLElement>(`.${ASB_ASS_SIGN_CLASS}`)) {
        if (!sign.hasAttribute(moveAttribute) && !sign.hasAttribute(fadeAttribute)) continue;
        const timing = timingOf(Number(sign.getAttribute(indexAttribute)));
        if (timing === undefined || typeof sign.animate !== 'function') continue;

        let animations = signAnimations.get(sign);
        if (animations === undefined) {
            animations = createAnimations(sign, timing);
            signAnimations.set(sign, animations);
        }

        for (const animation of animations) {
            animation.playbackRate = playbackRate > 0 ? playbackRate : 1;
            animation.currentTime = Math.max(0, currentTimeMs - timing.start);
            if (paused) animation.pause();
            else animation.play();
        }
    }
};
