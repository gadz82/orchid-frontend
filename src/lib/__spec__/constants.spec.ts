/**
 * Tests for the upload constants + ``isAcceptedFile`` predicate.
 *
 * Coverage:
 * - The MIME-type table accepts every filetype the chat advertises.
 * - The extension-fallback path catches files that arrive with a generic
 *   or empty MIME type — common when files are dropped from
 *   filesystem managers.
 * - Unknown types are rejected.
 * - The HTML ``accept`` string is a comma-separated list of every
 *   advertised extension.
 */

import {describe, expect, it} from "vitest";

import {
    ACCEPTED_EXTENSIONS,
    ACCEPTED_INPUT_STRING,
    ACCEPTED_MIME_TYPES,
    isAcceptedFile,
} from "../constants";

function mkFile(name: string, type: string): File {
    return new File(["abc"], name, {type});
}

describe("ACCEPTED_INPUT_STRING", () => {
    it("is the comma-separated list of every accepted extension", () => {
        const parts = ACCEPTED_INPUT_STRING.split(",").map((s) => s.trim());
        // Order is fixed — used as the value of an input ``accept`` attribute.
        expect(parts).toEqual([
            ".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md", ".png", ".jpg", ".jpeg",
        ]);
        // Every part is also in the canonical extension set.
        for (const p of parts) {
            expect(ACCEPTED_EXTENSIONS.has(p)).toBe(true);
        }
    });
});

describe("isAcceptedFile — MIME-type path", () => {
    it.each(Array.from(ACCEPTED_MIME_TYPES))(
        "accepts MIME %s",
        (mime) => {
            // The extension is intentionally generic so the MIME
            // branch is the only thing that can decide.
            expect(isAcceptedFile(mkFile("anything.bin", mime))).toBe(true);
        },
    );

    it("rejects an unknown MIME with an unknown extension", () => {
        expect(
            isAcceptedFile(mkFile("malware.exe", "application/x-msdownload")),
        ).toBe(false);
    });
});

describe("isAcceptedFile — extension-fallback path", () => {
    it.each([
        ["report.pdf"],
        ["notes.txt"],
        ["readme.md"],
        ["screenshot.PNG"],
        ["picture.JPG"],
        ["picture.JPEG"],
        ["sheet.XLSX"],
        ["doc.DOCX"],
        ["data.csv"],
    ])("accepts %s when the MIME type is empty", (name) => {
        expect(isAcceptedFile(mkFile(name, ""))).toBe(true);
    });

    it("rejects unknown extensions when the MIME type is empty", () => {
        expect(isAcceptedFile(mkFile("payload.bin", ""))).toBe(false);
        expect(isAcceptedFile(mkFile("notes", ""))).toBe(false);
    });

    it("matches the extension case-insensitively", () => {
        expect(isAcceptedFile(mkFile("foo.PnG", ""))).toBe(true);
    });
});
