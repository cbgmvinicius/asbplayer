import React, { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { IndexedSubtitleModel, SubtitleModel } from '@project/common';
import { assSignHtml, syncAssSignAnimations } from '@project/common/util/ass-sign';

interface Props {
    signs: IndexedSubtitleModel[];
    subtitles: SubtitleModel[];
    video: HTMLVideoElement | undefined;
    containerRef: RefObject<HTMLElement | null>;
    // Changes whenever the player is resized, so the picture area is measured again.
    layoutKey: string;
    zIndex: number;
    onMouseOver: React.MouseEventHandler<HTMLDivElement>;
    onMouseOut: React.MouseEventHandler<HTMLDivElement>;
}

/** Draws ASS typeset signs over the part of the video element where the picture is shown. */
export default function AssSignLayer({
    signs,
    subtitles,
    video,
    containerRef,
    layoutKey,
    zIndex,
    onMouseOver,
    onMouseOut,
}: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const subtitlesRef = useRef(subtitles);
    subtitlesRef.current = subtitles;

    useLayoutEffect(() => {
        const layer = ref.current;
        const container = containerRef.current;
        if (!layer || !container || !video) return;

        const videoRect = video.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        let left = videoRect.left - containerRect.left;
        let top = videoRect.top - containerRect.top;
        let width = videoRect.width;
        let height = videoRect.height;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
            left += (width - video.videoWidth * scale) / 2;
            top += (height - video.videoHeight * scale) / 2;
            width = video.videoWidth * scale;
            height = video.videoHeight * scale;
        }

        layer.style.left = `${left}px`;
        layer.style.top = `${top}px`;
        layer.style.width = `${width}px`;
        layer.style.height = `${height}px`;
    }, [video, containerRef, layoutKey, signs]);

    useEffect(() => {
        const layer = ref.current;
        if (!layer || !video) return;

        const sync = () =>
            syncAssSignAnimations(
                layer,
                video.currentTime * 1000,
                video.paused,
                video.playbackRate,
                (index) => subtitlesRef.current[index]
            );
        sync();
        const events = ['play', 'pause', 'seeked', 'ratechange'];
        for (const event of events) video.addEventListener(event, sync);
        return () => {
            for (const event of events) video.removeEventListener(event, sync);
        };
    }, [video, signs]);

    return (
        <div
            ref={ref}
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}
            style={{
                position: 'absolute',
                overflow: 'hidden',
                pointerEvents: 'none',
                containerType: 'size',
                zIndex,
            }}
            dangerouslySetInnerHTML={{
                __html: signs.map((sign) => assSignHtml(sign.text, sign.assLayout!, sign.index)).join(''),
            }}
        />
    );
}
