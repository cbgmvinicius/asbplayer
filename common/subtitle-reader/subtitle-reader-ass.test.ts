import { describe, expect, it, jest } from '@jest/globals';
import SubtitleReader from '@project/common/subtitle-reader/subtitle-reader';
import { SubtitleHtml } from '@project/common';

// SRT parsing is not exercised here, and the package ships ESM that ts-jest does not transform.
jest.mock('@qgustavor/srt-parser', () => ({ __esModule: true, default: class {} }));

// Uses the real ass-compiler, which subtitle-reader.test.ts mocks out.
const createReader = (renderAssSigns = false) =>
    new SubtitleReader({
        regexFilter: '',
        regexFilterTextReplacement: '',
        subtitleHtml: SubtitleHtml.render,
        convertNetflixRuby: false,
        renderAssSigns,
        pgsParserWorkerFactory: () => Promise.reject(new Error('PGS worker is not used in these tests')),
    });

describe('ASS typeset signs', () => {
    const assFile = (events: string[]) =>
        ({
            name: 'test.ass',
            text: async () =>
                [
                    '[Script Info]',
                    'ScriptType: v4.00+',
                    'PlayResX: 640',
                    'PlayResY: 360',
                    '',
                    '[V4+ Styles]',
                    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
                    'Style: Default,Arial,24,&H00FFFFFF,&H000019FF,&H00000000,&H6E000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,20,1',
                    '',
                    '[Events]',
                    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
                    ...events,
                ].join('\n'),
        }) as unknown as File;

    it('drops positioned signs with typesetting overrides and keeps dialogue', async () => {
        const subtitles = await createReader().subtitles([
            {
                fileParts: [
                    assFile([
                        String.raw`Dialogue: 0,0:00:01.00,0:00:05.00,Default,SIGN,0,0,0,,{\an8\bord0\fs12\fnGeorgia\c&HBABAA1&\move(264,22,251,22)}Classroom`,
                        String.raw`Dialogue: 0,0:00:01.00,0:00:05.00,Default,SIGN,0,0,0,,{\an1\fs15\frz333\pos(518,292)}Rustle\NRustle`,
                        String.raw`Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,{\pos(100,100)\p1}m 0 0 l 10 0 10 10{\p0}`,
                        'Dialogue: 0,0:00:02.00,0:00:04.00,Default,TEACHER,0,0,0,,This is where it starts.',
                        String.raw`Dialogue: 0,0:00:06.00,0:00:08.00,Default,ASHITO,0,0,0,,{\pos(460,247.5)}Look up!`,
                        String.raw`Dialogue: 0,0:00:09.00,0:00:10.00,Default,ASHITO,0,0,0,,{\pos(460,247.5)\i1}Look up again!`,
                        String.raw`Dialogue: 0,0:00:11.00,0:00:12.00,Default,ASHITO,0,0,0,,{\fs30}Loud, but not positioned.`,
                    ]),
                ],
            },
        ]);

        expect(subtitles.map((subtitle) => subtitle.text)).toEqual([
            'This is where it starts.',
            'Look up!',
            'Look up again!',
            'Loud, but not positioned.',
        ]);
        expect(subtitles.every((subtitle) => subtitle.assLayout === undefined)).toBe(true);
    });

    it('keeps positioned signs with their layout when signs are rendered', async () => {
        const subtitles = await createReader(true).subtitles([
            {
                fileParts: [
                    assFile([
                        String.raw`Dialogue: 0,0:00:01.00,0:00:05.00,Default,SIGN,0,0,0,,{\an8\bord3\fs36\fnGeorgia\c&H0080FF&\3c&HFFFFFF&\alpha&H80&\frz10\fscx90\b1\fad(200,300)\move(320,36,160,72,1000,3000)}Classroom`,
                        String.raw`Dialogue: 0,0:00:01.00,0:00:05.00,Default,SIGN,0,0,0,,{\fs15\i1\pos(64,180)}Rustle\NRustle`,
                        String.raw`Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,{\pos(100,100)\p1}m 0 0 l 10 0 10 10{\p0}`,
                        String.raw`Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,{\pos(100,100)\fs20\clip(0,0,320,180)}Clipped`,
                        'Dialogue: 0,0:00:02.00,0:00:04.00,Default,TEACHER,0,0,0,,This is where it starts.',
                        String.raw`Dialogue: 0,0:00:06.00,0:00:08.00,Default,ASHITO,0,0,0,,{\pos(460,247.5)}Look up!`,
                    ]),
                ],
            },
        ]);

        expect(subtitles.map((subtitle) => [subtitle.text, subtitle.assLayout !== undefined])).toEqual([
            ['Classroom', true],
            ['Rustle\nRustle', true],
            ['This is where it starts.', false],
            ['Look up!', true],
        ]);
        expect(subtitles[0].assLayout?.dialogue).toBeUndefined();
        // Repositioned dialogue keeps its place but is marked as dialogue, so it's drawn with the user's appearance.
        expect(subtitles[3].assLayout).toMatchObject({ x: 460 / 640, y: 247.5 / 360, alignment: 2, dialogue: true });
        expect(subtitles[0].assLayout).toEqual({
            x: 0.5,
            y: 0.1,
            alignment: 8,
            move: { x: 0.25, y: 0.2, start: 1000, end: 3000 },
            fadeIn: 200,
            fadeOut: 300,
            fontFamily: 'Georgia',
            fontSize: 0.1,
            color: 'rgba(255, 128, 0, 0.498)',
            outlineColor: 'rgba(255, 255, 255, 0.498)',
            outlineWidth: 3 / 360,
            bold: true,
            italic: false,
            rotation: 10,
            scaleX: 0.9,
            scaleY: 1,
        });
        expect(subtitles[1].assLayout).toMatchObject({
            x: 0.1,
            y: 0.5,
            alignment: 2,
            fontFamily: 'Arial',
            italic: true,
            move: undefined,
            fadeIn: undefined,
        });
    });

    it('places dialogue that the script aligns away from the bottom', async () => {
        const subtitles = await createReader(true).subtitles([
            {
                fileParts: [
                    assFile([
                        'Dialogue: 0,0:00:01.00,0:00:03.00,Default,A,0,0,0,,Bottom line.',
                        String.raw`Dialogue: 0,0:00:01.00,0:00:03.00,Default,B,0,0,0,,{\an8}Top line.`,
                        String.raw`Dialogue: 0,0:00:01.00,0:00:03.00,Default,C,0,0,0,,{\an7}Top left line.`,
                        String.raw`Dialogue: 0,0:00:01.00,0:00:03.00,Default,D,0,0,0,,{\an1}Bottom left line.`,
                    ]),
                ],
            },
        ]);

        expect(subtitles.map((subtitle) => [subtitle.text, subtitle.assLayout])).toEqual([
            ['Bottom line.', undefined],
            ['Top line.', expect.objectContaining({ x: 0.5, y: 20 / 360, alignment: 8, dialogue: true })],
            ['Top left line.', expect.objectContaining({ x: 10 / 640, y: 20 / 360, alignment: 7, dialogue: true })],
            ['Bottom left line.', undefined],
        ]);
    });

    it('keeps dialogue in the subtitle box when signs are not rendered', async () => {
        const subtitles = await createReader(false).subtitles([
            {
                fileParts: [assFile([String.raw`Dialogue: 0,0:00:01.00,0:00:03.00,Default,B,0,0,0,,{\an8}Top line.`])],
            },
        ]);

        expect(subtitles[0].assLayout).toBeUndefined();
    });

    it('strips characters that could break out of the font name', async () => {
        const subtitles = await createReader(true).subtitles([
            {
                fileParts: [
                    assFile([
                        String.raw`Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,{\fnEvil"; background:url(x)\fs20\pos(10,10)}Sign`,
                    ]),
                ],
            },
        ]);

        expect(subtitles[0].assLayout?.fontFamily).toBe('Evil backgroundurlx');
    });
});
