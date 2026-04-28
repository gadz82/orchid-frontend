/**
 * Tests for the shared API-client helpers.
 *
 * Coverage:
 * - getHeaders includes Content-Type=application/json + bearer token.
 * - getAuthHeaders omits Content-Type (used for multipart).
 * - Both helpers omit the bearer when there's no session token.
 * - A session in RefreshAccessTokenError state forces handleUnauthorized
 *   before any header is returned.
 * - handleUnauthorized signs out + redirects.
 */

import {beforeEach, describe, expect, it, vi} from "vitest";

const {authMock, signOutMock, redirectMock} = vi.hoisted(() => ({
    authMock: vi.fn(),
    signOutMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
        const err = new Error(`NEXT_REDIRECT;${url}`);
        (err as Error & {digest: string}).digest = `NEXT_REDIRECT;replace;${url};307;`;
        throw err;
    }),
}));

vi.mock("@/lib/auth/auth", () => ({
    auth: authMock,
    signOut: signOutMock,
}));

vi.mock("next/navigation", () => ({
    redirect: redirectMock,
}));

import {getAuthHeaders, getHeaders, handleUnauthorized} from "../_api-client";

beforeEach(() => {
    authMock.mockReset();
    signOutMock.mockReset().mockResolvedValue(undefined);
    redirectMock.mockClear();
});

describe("getHeaders", () => {
    it("returns Content-Type + Authorization when a token is present", async () => {
        authMock.mockResolvedValue({accessToken: "tok"});
        expect(await getHeaders()).toEqual({
            "Content-Type": "application/json",
            Authorization: "Bearer tok",
        });
    });

    it("omits Authorization when no session/token", async () => {
        authMock.mockResolvedValue(null);
        expect(await getHeaders()).toEqual({
            "Content-Type": "application/json",
        });
    });

    it("forces handleUnauthorized when the session is in RefreshAccessTokenError state", async () => {
        authMock.mockResolvedValue({error: "RefreshAccessTokenError"});
        await expect(getHeaders()).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
        expect(signOutMock).toHaveBeenCalled();
    });
});

describe("getAuthHeaders", () => {
    it("returns only Authorization when a token is present", async () => {
        authMock.mockResolvedValue({accessToken: "tok"});
        expect(await getAuthHeaders()).toEqual({Authorization: "Bearer tok"});
    });

    it("returns an empty object when no session/token", async () => {
        authMock.mockResolvedValue(null);
        expect(await getAuthHeaders()).toEqual({});
    });

    it("forces handleUnauthorized on RefreshAccessTokenError", async () => {
        authMock.mockResolvedValue({error: "RefreshAccessTokenError"});
        await expect(getAuthHeaders()).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
    });
});

describe("handleUnauthorized", () => {
    it("signs the user out then redirects to /login", async () => {
        await expect(handleUnauthorized()).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
        expect(signOutMock).toHaveBeenCalledWith({redirect: false});
        expect(redirectMock).toHaveBeenCalledWith("/login");
    });
});
