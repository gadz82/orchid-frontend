/**
 * Shared constants — file types, limits, etc.
 *
 * Single source of truth for accepted upload types used by
 * ChatContainer (drag-and-drop) and ChatInput (file picker).
 */

/** MIME types accepted for upload */
export const ACCEPTED_MIME_TYPES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
    "text/markdown",
    "image/png",
    "image/jpeg",
]);

/** File extensions accepted for upload */
export const ACCEPTED_EXTENSIONS = new Set([
    ".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md", ".png", ".jpg", ".jpeg",
]);

/** Accept string for HTML file inputs */
export const ACCEPTED_INPUT_STRING =
    ".pdf,.docx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg";

/** Check if a file matches the accepted types (by MIME or extension) */
export function isAcceptedFile(file: File): boolean {
    if (ACCEPTED_MIME_TYPES.has(file.type)) return true;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    return ACCEPTED_EXTENSIONS.has(ext);
}
