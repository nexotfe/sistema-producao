/* @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } },
}));

import { supabase } from "@/lib/supabaseClient";
import { signOutLocal } from "./signOutLocal";

describe("signOutLocal", () => {
  it("desloga só a sessão local (scope local), nunca revoga globalmente", async () => {
    await signOutLocal();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
