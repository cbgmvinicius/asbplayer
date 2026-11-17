import type { CompiledASS, CompiledASSStyleTag, Dialogue } from 'ass-compiler';
import type { SubtitleAssLayout } from '@project/common';

// ASS colors are BBGGRR hex and alphas are 00 (opaque) to FF (transparent).
const assColorToCss = (color: string | undefined, alpha: string | undefined, fallback: string) => {
    if (color === undefined || !/^[0-9a-f]{1,6}$/i.test(color)) return fallback;
    const bgr = color.padStart(6, '0');
    const [b, g, r] = [bgr.slice(0, 2), bgr.slice(2, 4), bgr.slice(4, 6)].map((hex) => parseInt(hex, 16));
    const transparency = alpha !== undefined && /^[0-9a-f]{1,2}$/i.test(alpha) ? parseInt(alpha, 16) / 255 : 0;
    return `rgba(${r}, ${g}, ${b}, ${Number((1 - transparency).toFixed(3))})`;
};

const finiteOr = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Builds the layout of a positioned ASS sign so it can be drawn where the script puts it.
 * Returns undefined for what can't be approximated with plain text: vector drawings and clips.
 */
export const assSignLayout = (dialogue: Dialogue, compiled: CompiledASS): SubtitleAssLayout | undefined => {
    if (dialogue.clip !== undefined) return undefined;
    if (dialogue.slices.some((slice) => slice.fragments.some((fragment) => fragment.drawing))) return undefined;
    if (dialogue.pos === undefined && dialogue.move === undefined) return undefined;
    return layout(dialogue, compiled, false);
};

/**
 * Builds the placement of a spoken line that the script puts somewhere other than the bottom of the screen, such as
 * a second speaker at the top (\an8) or a line next to a character (\pos). Returns undefined for lines at the bottom.
 */
export const assDialogueLayout = (dialogue: Dialogue, compiled: CompiledASS): SubtitleAssLayout | undefined => {
    const atBottom = dialogue.alignment >= 1 && dialogue.alignment <= 3;
    if (dialogue.pos === undefined && dialogue.move === undefined && atBottom) return undefined;
    return layout(dialogue, compiled, true);
};

const layout = (dialogue: Dialogue, compiled: CompiledASS, isDialogue: boolean): SubtitleAssLayout => {
    const width = compiled.width > 0 ? compiled.width : 384;
    const height = compiled.height > 0 ? compiled.height : 288;
    const firstSlice = dialogue.slices[0];
    const firstFragment = firstSlice?.fragments[0];
    // Line-level properties (position, rotation, scale) come from the first override block, like in libass.
    const tag: Partial<CompiledASSStyleTag> = {
        ...(firstSlice ? compiled.styles[firstSlice.style]?.tag : undefined),
        ...firstFragment?.tag,
    };

    const alignment = dialogue.alignment >= 1 && dialogue.alignment <= 9 ? dialogue.alignment : 2;
    let x: number;
    let y: number;
    let move: SubtitleAssLayout['move'];
    if (dialogue.move !== undefined) {
        const { x1, y1, x2, y2, t1, t2 } = dialogue.move;
        x = x1;
        y = y1;
        const duration = (dialogue.end - dialogue.start) * 1000;
        const moveStart = finiteOr(t1, 0);
        const moveEnd = finiteOr(t2, 0) > moveStart ? t2 : duration;
        move = { x: x2 / width, y: y2 / height, start: moveStart, end: moveEnd };
    } else if (dialogue.pos !== undefined) {
        x = dialogue.pos.x;
        y = dialogue.pos.y;
    } else {
        // Without \pos the line sits inside the margins, at the edge or middle its alignment points to.
        const column = (alignment - 1) % 3;
        const row = Math.floor((alignment - 1) / 3);
        const { left, right, vertical } = dialogue.margin;
        x = [left, (left + width - right) / 2, width - right][column];
        y = [height - vertical, height / 2, vertical][row];
    }

    const fade = dialogue.fade?.type === 'fad' ? dialogue.fade : undefined;

    return {
        x: x / width,
        y: y / height,
        alignment,
        ...(isDialogue ? { dialogue: true } : {}),
        move,
        fadeIn: fade && fade.t1 > 0 ? fade.t1 : undefined,
        fadeOut: fade && fade.t2 > 0 ? fade.t2 : undefined,
        // The name ends up in inline CSS, so keep only characters that can't break out of a quoted font name.
        fontFamily: (tag.fn ?? '').replace(/["'`\\;:<>{}()[\]]/g, '').trim(),
        fontSize: finiteOr(tag.fs, 20) / height,
        color: assColorToCss(tag.c1, tag.a1, 'rgba(255, 255, 255, 1)'),
        outlineColor: assColorToCss(tag.c3, tag.a3, 'rgba(0, 0, 0, 1)'),
        outlineWidth: Math.max(finiteOr(tag.xbord, 0), finiteOr(tag.ybord, 0)) / height,
        bold: finiteOr(tag.b, 0) !== 0,
        italic: finiteOr(tag.i, 0) !== 0,
        rotation: finiteOr(tag.frz, 0),
        scaleX: finiteOr(tag.fscx, 100) / 100,
        scaleY: finiteOr(tag.fscy, 100) / 100,
    };
};
