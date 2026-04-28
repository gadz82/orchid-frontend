/**
 * Tests for the drag-drop hook.
 *
 * Coverage:
 * - Counter-based dragOver: enter/leave nest correctly without
 *   flickering on child re-entries.
 * - Only Files-typed drags trigger the overlay.
 * - Drop appends accepted files; rejects unaccepted ones.
 * - ``disabled`` opt-in prevents drop from updating state but still
 *   resets the overlay.
 * - prevent/stop are called on every event (we'd otherwise see the
 *   browser navigate to the dropped file).
 */

import {act, renderHook} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {useDragDrop} from "../use-drag-drop";

interface FakeDataTransfer {
    types: string[];
    files: File[];
}

function dragEvent(dt: Partial<FakeDataTransfer> = {}) {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const dataTransfer: FakeDataTransfer = {
        types: dt.types ?? ["Files"],
        files: dt.files ?? [],
    };
    return {
        event: {
            preventDefault,
            stopPropagation,
            dataTransfer,
        } as unknown as React.DragEvent,
        preventDefault,
        stopPropagation,
    };
}

function txt(name = "a.txt"): File {
    return new File(["x"], name, {type: "text/plain"});
}

function exe(name = "bad.exe"): File {
    return new File(["x"], name, {type: "application/x-msdownload"});
}

describe("useDragDrop", () => {
    it("counts nested dragenter/dragleave so the overlay survives child events", () => {
        const {result} = renderHook(() => useDragDrop());
        expect(result.current.dragOver).toBe(false);

        act(() => {
            result.current.dragHandlers.onDragEnter(dragEvent().event);
        });
        expect(result.current.dragOver).toBe(true);

        // Simulate the event firing on a nested child too.
        act(() => {
            result.current.dragHandlers.onDragEnter(dragEvent().event);
        });
        expect(result.current.dragOver).toBe(true);

        // First leave is for the inner element — overlay stays.
        act(() => {
            result.current.dragHandlers.onDragLeave(dragEvent().event);
        });
        expect(result.current.dragOver).toBe(true);

        // Second leave is the outer drop target — overlay clears.
        act(() => {
            result.current.dragHandlers.onDragLeave(dragEvent().event);
        });
        expect(result.current.dragOver).toBe(false);
    });

    it("does not show the overlay for non-Files drags (e.g. text/uri-list)", () => {
        const {result} = renderHook(() => useDragDrop());
        act(() => {
            result.current.dragHandlers.onDragEnter(
                dragEvent({types: ["text/plain"]}).event,
            );
        });
        expect(result.current.dragOver).toBe(false);
    });

    it("appends accepted files on drop, ignores rejected ones", () => {
        const {result} = renderHook(() => useDragDrop());
        const ok = txt("notes.txt");
        const rejected = exe();

        act(() => {
            result.current.dragHandlers.onDragEnter(dragEvent().event);
            result.current.dragHandlers.onDrop(
                dragEvent({files: [ok, rejected]}).event,
            );
        });

        expect(result.current.dragOver).toBe(false);
        expect(result.current.droppedFiles).toEqual([ok]);
    });

    it("appends across multiple drops", () => {
        const {result} = renderHook(() => useDragDrop());
        const a = txt("a.txt");
        const b = txt("b.txt");

        act(() => {
            result.current.dragHandlers.onDrop(dragEvent({files: [a]}).event);
        });
        act(() => {
            result.current.dragHandlers.onDrop(dragEvent({files: [b]}).event);
        });

        expect(result.current.droppedFiles).toEqual([a, b]);
    });

    it("clears the overlay on drop even when the consumer is disabled", () => {
        const {result} = renderHook(() => useDragDrop({disabled: true}));
        act(() => {
            result.current.dragHandlers.onDragEnter(dragEvent().event);
            result.current.dragHandlers.onDrop(
                dragEvent({files: [txt()]}).event,
            );
        });
        expect(result.current.dragOver).toBe(false);
        // Disabled drops are silently swallowed.
        expect(result.current.droppedFiles).toEqual([]);
    });

    it("calls preventDefault + stopPropagation on every drag event", () => {
        const {result} = renderHook(() => useDragDrop());

        const enter = dragEvent();
        const leave = dragEvent();
        const over = dragEvent();
        const drop = dragEvent({files: [txt()]});

        act(() => {
            result.current.dragHandlers.onDragEnter(enter.event);
            result.current.dragHandlers.onDragOver(over.event);
            result.current.dragHandlers.onDragLeave(leave.event);
            result.current.dragHandlers.onDrop(drop.event);
        });

        for (const ev of [enter, over, leave, drop]) {
            expect(ev.preventDefault).toHaveBeenCalled();
            expect(ev.stopPropagation).toHaveBeenCalled();
        }
    });

    it("setDroppedFiles replaces the array (used to clear after submit)", () => {
        const {result} = renderHook(() => useDragDrop());
        act(() => {
            result.current.dragHandlers.onDrop(
                dragEvent({files: [txt("a.txt")]}).event,
            );
        });
        expect(result.current.droppedFiles).toHaveLength(1);

        act(() => {
            result.current.setDroppedFiles([]);
        });
        expect(result.current.droppedFiles).toEqual([]);
    });
});
