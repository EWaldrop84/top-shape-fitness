import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { AppUser } from "@/types";
import Login from "@/pages/Login";
import AdminDashboard from "@/pages/AdminDashboard";
import TrainerPortal from "@/pages/TrainerPortal";
import ClientPortal from "@/pages/ClientPortal";
import InstallPrompt from "@/components/InstallPrompt";

type AuthState = "loading" | "unauthenticated" | "authenticated";

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  useEffect(() => {
    // On mount, check for an existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadUserProfile(session.user.id);
      } else {
        setAuthState("unauthenticated");
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setCurrentUser(null);
        setAuthState("unauthenticated");
      } else if (event === "SIGNED_IN" && session.user) {
        await loadUserProfile(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function loadUserProfile(userId: string) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !data) {
      // No matching row in public.users — sign them out
      await supabase.auth.signOut();
      setAuthState("unauthenticated");
      return;
    }

    setCurrentUser(data as AppUser);
    setAuthState("authenticated");
  }

  function handleLogin(user: AppUser) {
    setCurrentUser(user);
    setAuthState("authenticated");
  }

  function handleLogout() {
    setCurrentUser(null);
    setAuthState("unauthenticated");
  }

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-[#2A255D] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#06A29E] flex items-center justify-center">
            <svg
              className="animate-spin w-5 h-5 text-white"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-white/50 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <Login onLogin={handleLogin} />;
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  switch (currentUser.role) {
    case "admin":
      return <><AdminDashboard user={currentUser} onLogout={handleLogout} /><InstallPrompt /></>;
    case "trainer":
      return <><TrainerPortal user={currentUser} onLogout={handleLogout} /><InstallPrompt /></>;
    case "client":
      return <><ClientPortal user={currentUser} onLogout={handleLogout} /><InstallPrompt /></>;
    default:
      return (
        <div className="min-h-screen bg-[#2A255D] flex items-center justify-center px-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center">
            <p className="text-[#2A255D] font-semibold mb-2">Unknown Role</p>
            <p className="text-sm text-gray-500 mb-4">
              Your account has an unrecognized role. Please contact your admin.
            </p>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg bg-[#06A29E] text-white text-sm font-medium hover:bg-[#048e8a] transition"
            >
              Log Out
            </button>
          </div>
        </div>
      );
  }
}
