import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/api";
import logoUrl from "@/assets/scropids-logo.svg";

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
      toast.success("Welcome to ScropIDS");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const onRegister = async (event: FormEvent) => {
    event.preventDefault();
    if (registerPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await register({
        username: registerUsername,
        password: registerPassword,
        organizationName,
      });
      toast.success("Account created. Welcome to ScropIDS");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/12" />
        <div className="absolute left-1/2 top-1/2 h-[18rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/8 blur-3xl" />
      </div>
      <div className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-cyan-300/30 bg-[#070d1a]/92 shadow-[0_24px_70px_rgba(0,0,0,0.55),0_0_48px_rgba(34,211,238,0.16)] backdrop-blur md:grid-cols-[0.95fr_1.05fr]">
        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-cyan-300/10" />
        <aside className="hidden border-r border-border/70 bg-gradient-to-b from-[#0b1528] to-[#070d1a] p-8 md:flex md:flex-col md:justify-between">
          <div>
            <div className="mb-6 inline-flex rounded-2xl border border-accent/40 bg-[#0b162c] p-2 shadow-[0_0_34px_rgba(34,211,238,0.24)]">
              <img src={logoUrl} alt="ScropIDS logo" className="h-16 w-16" />
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">ScropIDS</h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Precision IDS workspace for endpoint visibility, anomaly triage, and controlled response.
            </p>
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted/70">Secure Access Panel</div>
        </aside>

        <section className="p-6 sm:p-8 md:p-10">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <img src={logoUrl} alt="ScropIDS logo" className="h-12 w-12 rounded-xl border border-accent/50 bg-[#0b162c] p-1.5" />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">ScropIDS</h1>
              <p className="text-sm text-muted">Sign in or create your account.</p>
            </div>
          </div>

          <div
            className={`mb-4 grid gap-2 rounded-xl border border-border/80 bg-[#0a1222] p-1 ${
              isLocalhost ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <Button type="button" variant={mode === "login" ? "default" : "ghost"} onClick={() => setMode("login")}>
              Login
            </Button>
            <Button
              type="button"
              variant={mode === "register" ? "default" : "ghost"}
              onClick={() => setMode("register")}
            >
              Register
            </Button>
            {isLocalhost ? (
              <Button asChild variant="ghost">
                <a href="/admin/login/?next=/admin/" target="_blank" rel="noreferrer">
                  Admin
                </a>
              </Button>
            ) : null}
          </div>

          {mode === "login" ? (
            <form className="grid gap-5" onSubmit={onSubmit}>
              <div className="grid gap-2.5">
                <label htmlFor="username" className="text-xs uppercase tracking-wide text-muted">
                  Username
                </label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="grid gap-2.5">
                <label htmlFor="password" className="text-xs uppercase tracking-wide text-muted">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-2.5 text-muted"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="h-10 text-base" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          ) : (
            <form className="grid gap-5" onSubmit={onRegister}>
              <div className="grid gap-2.5">
                <label htmlFor="register-username" className="text-xs uppercase tracking-wide text-muted">
                  Username
                </label>
                <Input
                  id="register-username"
                  value={registerUsername}
                  onChange={(event) => setRegisterUsername(event.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="grid gap-2.5">
                <label htmlFor="organization-name" className="text-xs uppercase tracking-wide text-muted">
                  Organization Name
                </label>
                <Input
                  id="organization-name"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2.5">
                <label htmlFor="register-password" className="text-xs uppercase tracking-wide text-muted">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="register-password"
                    type={showPassword ? "text" : "password"}
                    value={registerPassword}
                    onChange={(event) => setRegisterPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-2.5 text-muted"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="grid gap-2.5">
                <label htmlFor="confirm-password" className="text-xs uppercase tracking-wide text-muted">
                  Confirm Password
                </label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <Button type="submit" className="h-10 text-base" disabled={submitting}>
                {submitting ? "Creating account..." : "Create account"}
              </Button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
