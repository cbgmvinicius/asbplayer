import { describe, expect, it } from '@jest/globals';
import type { SubtitleAssLayout } from '@project/common';
import { assSignHtml, syncAssSignAnimations } from '@project/common/util/ass-sign';

const layout: SubtitleAssLayout = {
    x: 0.5,
    y: 0.1,
    alignment: 8,
    fontFamily: 'Georgia',
    fontSize: 0.1,
    color: 'rgba(255, 128, 0, 1)',
    outlineColor: 'rgba(0, 0, 0, 1)',
    outlineWidth: 0.01,
    bold: true,
    italic: false,
    rotation: 10,
    scaleX: 0.9,
    scaleY: 1,
};

const render = (html: string) => {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
};

describe('assSignHtml', () => {
    it('places the sign at its anchor point and aligns the text box around it', () => {
        const root = render(assSignHtml('Classroom', layout, 3));
        const sign = root.firstElementChild as HTMLElement;
        const text = sign.firstElementChild as HTMLElement;

        expect(sign.getAttribute('data-asb-ass-index')).toBe('3');
        expect(sign.style.left).toBe('50%');
        expect(sign.style.top).toBe('10%');
        expect(text.textContent).toBe('Classroom');
        // \an8: centered horizontally, hanging from the anchor.
        expect(text.style.transform).toBe('translate(-50%, -0%) rotate(-10deg) scale(0.9, 1)');
        expect(text.style.transformOrigin).toBe('50% 0%');
        expect(text.style.textAlign).toBe('center');
        expect(text.style.fontFamily).toBe('"Georgia", sans-serif');
        expect(text.style.fontWeight).toBe('700');
        expect(text.style.color).toBe('rgb(255, 128, 0)');
    });

    it('anchors bottom-right aligned signs at their bottom-right corner', () => {
        const root = render(assSignHtml('Sign', { ...layout, alignment: 3, rotation: 0 }, 0));
        const text = root.firstElementChild!.firstElementChild as HTMLElement;

        expect(text.style.transform).toBe('translate(-100%, -100%) rotate(0deg) scale(0.9, 1)');
        expect(text.style.textAlign).toBe('right');
    });

    it('keeps the move and fade timings for the animations', () => {
        const root = render(
            assSignHtml('Sign', { ...layout, move: { x: 0.25, y: 0.2, start: 1000, end: 3000 }, fadeIn: 200 }, 0)
        );
        const sign = root.firstElementChild as HTMLElement;

        expect(sign.getAttribute('data-asb-ass-move')).toBe('0.25,0.2,1000,3000');
        expect(sign.getAttribute('data-asb-ass-fade')).toBe('200,0');
    });

    it('does not let the text add attributes or elements beyond what the reader sanitized', () => {
        const root = render(assSignHtml('<b>Bold</b>', layout, 0));

        expect(root.querySelectorAll('b')).toHaveLength(1);
        expect(root.querySelectorAll('[data-asb-ass-index]')).toHaveLength(1);
    });

    it('skips animations when the browser has none', () => {
        const root = render(assSignHtml('Sign', { ...layout, fadeIn: 200 }, 0));

        expect(() => syncAssSignAnimations(root, 500, false, 1, () => ({ start: 0, end: 1000 }))).not.toThrow();
    });
});
