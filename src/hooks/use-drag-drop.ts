"use client";

import {useState, useCallback, useRef} from "react";
import {isAcceptedFile} from "@/lib/constants";

/**
 * Manages drag-and-drop file state for the chat area.
 *
 * Uses a counter ref (not state) to handle nested dragenter/dragleave
 * events correctly — each child element fires its own events.
 */
export function useDragDrop(opts: {disabled?: boolean} = {}) {
    const [dragOver, setDragOver] = useState(false);
    const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
    const dragCounterRef = useRef(0);

    const onDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current += 1;
        if (e.dataTransfer.types.includes("Files")) {
            setDragOver(true);
        }
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current -= 1;
        if (dragCounterRef.current === 0) {
            setDragOver(false);
        }
    }, []);

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current = 0;
            setDragOver(false);

            if (opts.disabled) return;

            const accepted = Array.from(e.dataTransfer.files).filter(isAcceptedFile);
            if (accepted.length > 0) {
                setDroppedFiles((prev) => [...prev, ...accepted]);
            }
        },
        [opts.disabled],
    );

    const dragHandlers = {onDragEnter, onDragLeave, onDragOver, onDrop};

    return {dragOver, droppedFiles, setDroppedFiles, dragHandlers};
}
