import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { AlertBanner } from "@/components/common/AlertBanner";
import { ConfirmationDialog } from "@/components/common/ConfirmationDialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { PasswordStrengthMeter } from "@/components/common/PasswordStrengthMeter";
import { SecurityCheckCard } from "@/components/common/SecurityCheckCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/format";
import { authService, evaluatePasswordStrength } from "@/services/authService";
import { securityService } from "@/services/securityService";
import type { AuthResponse, OperationState, SecurityCheck, SessionInfo } from "@/types";

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  name,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  autoComplete: string;
  name?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          defaultValue={value}
          autoComplete={autoComplete}
          onInput={(event) => onChange?.(event.currentTarget.value)}
          onChange={(event) => onChange?.(event.currentTarget.value)}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-0 right-0 h-9 w-9"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

function RegisterTab() {
  const { refresh } = useAuth();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<OperationState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AuthResponse | null>(null);

  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const fieldErrors = {
    username: username.length > 0 && username.length < 3 ? "Username must be at least 3 characters." : null,
    email: email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "Enter a valid email address." : null,
    confirm: confirmPassword.length > 0 && confirmPassword !== password ? "Passwords do not match." : null,
  };

  function getRegistrationValues(form: HTMLFormElement | null = null) {
    const current = form ? new FormData(form) : null;
    const nextUsername = String(current?.get("username") ?? username).trim();
    const nextEmail = String(current?.get("email") ?? email).trim();
    const nextPassword = String(current?.get("password") ?? password);
    const nextConfirmPassword = String(current?.get("confirmPassword") ?? confirmPassword);
    return { username: nextUsername, email: nextEmail, password: nextPassword, confirmPassword: nextConfirmPassword };
  }

  async function submitRegistration(form: HTMLFormElement | null = null) {
    const values = getRegistrationValues(form);
    if (!values.username || !values.email || !values.password || !values.confirmPassword) {
      setState("error");
      setMessage("Complete all fields before submitting.");
      return;
    }
    if (
      (values.username.length > 0 && values.username.length < 3) ||
      (values.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) ||
      (values.confirmPassword.length > 0 && values.confirmPassword !== values.password)
    ) {
      setState("error");
      setMessage("Fix the highlighted fields and try again.");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const response = await authService.register({
        username: values.username,
        email: values.email,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      setResult(response);
      setState("success");
      setPassword("");
      setConfirmPassword("");
      await refresh();
      toast.success("Account created and signed in.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Registration could not be completed.");
    }
  }

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const handleSubmit = (event: Event) => {
      event.preventDefault();
      void submitRegistration(form);
    };

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [submitRegistration]);

  return (
    <form ref={formRef} className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reg-username">Username</Label>
          <Input id="reg-username" name="username" value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
          {fieldErrors.username ? <p className="text-xs text-destructive">{fieldErrors.username}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="reg-email">Email</Label>
          <Input id="reg-email" name="email" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
          {fieldErrors.email ? <p className="text-xs text-destructive">{fieldErrors.email}</p> : null}
        </div>
        <PasswordField id="reg-password" name="password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" />
        <PasswordField id="reg-confirm" name="confirmPassword" label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
        {fieldErrors.confirm ? <p className="text-xs text-destructive">{fieldErrors.confirm}</p> : null}
        <Button
          type="submit"
          onClick={(event) => {
            const form = (event.currentTarget as HTMLButtonElement).closest("form");
            void submitRegistration(form);
          }}
          disabled={state === "loading"}
        >
          Create account
        </Button>
      </div>
      <div className="space-y-4">
        <PasswordStrengthMeter result={strength} />
        {state === "loading" ? <LoadingState label="Creating account…" rows={2} /> : null}
        {state === "error" && message ? <ErrorState message={message} /> : null}
        {state === "success" && result ? (
          <AlertBanner variant="info" title="Registration succeeded">
            User {result.username} ({result.email}) was stored in PostgreSQL. The password was hashed with Argon2id and is not shown.
          </AlertBanner>
        ) : null}
      </div>
    </form>
  );
}

function LoginTab() {
  const { refresh } = useAuth();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [state, setState] = useState<OperationState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  function getLoginValues(form: HTMLFormElement | null = null) {
    const current = form ? new FormData(form) : null;
    return {
      identifier: String(current?.get("identifier") ?? identifier).trim(),
      password: String(current?.get("password") ?? password),
      rememberMe,
    };
  }

  async function submitLogin(form: HTMLFormElement | null = null) {
    const values = getLoginValues(form);
    setMessage(null);
    setCode(null);
    if (!values.identifier || !values.password) {
      setState("error");
      setMessage("Enter a username/email and password.");
      return;
    }
    setState("loading");
    try {
      await authService.login({ identifier: values.identifier, password: values.password, rememberMe: values.rememberMe });
      await refresh();
      setState("success");
      setPassword("");
      toast.success("Signed in.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Sign-in could not be completed.");
      setCode(error && typeof error === "object" && "code" in error ? String(error.code) : null);
    }
  }

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const handleSubmit = (event: Event) => {
      event.preventDefault();
      void submitLogin(form);
    };

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [submitLogin]);

  return (
    <form ref={formRef} className="mx-auto max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-id">Username / email</Label>
        <Input id="login-id" name="identifier" value={identifier} autoComplete="username" onChange={(e) => setIdentifier(e.target.value)} />
      </div>
      <PasswordField id="login-password" name="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <div className="flex items-center gap-2">
        <Checkbox id="remember" checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
        <Label htmlFor="remember" className="font-normal">
          Remember me
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Credentials are checked against PostgreSQL. Failed attempts are rate limited and can lock the account.
      </p>
      <Button
        type="submit"
        onClick={(event) => {
          const form = (event.currentTarget as HTMLButtonElement).closest("form");
          void submitLogin(form);
        }}
        disabled={state === "loading"}
      >
        Login
      </Button>
      {state === "loading" ? <LoadingState label="Authenticating…" rows={2} /> : null}
      {state === "error" && message ? (
        <ErrorState title={code === "ACCOUNT_LOCKED" ? "Account locked" : "Sign-in failed"} message={message} />
      ) : null}
      {state === "success" ? (
        <AlertBanner variant="info" title="Signed in">
          A server session cookie was issued. Remember-me extends the same HttpOnly session cookie policy.
        </AlertBanner>
      ) : null}
    </form>
  );
}

function PasswordStrengthTab() {
  const [password, setPassword] = useState("");
  const result = useMemo(() => evaluatePasswordStrength(password), [password]);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PasswordField id="strength-password" label="Sample password" value={password} onChange={setPassword} autoComplete="off" />
      <PasswordStrengthMeter result={result} />
      <div className="rounded-xl border border-border bg-card/70 p-4">
        <p className="text-xs text-muted-foreground">Overall score</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-primary">
          {result.score} / 4 · {result.label}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Recommendation: {result.score >= 4 ? "Policy requirements are met." : "Add missing character classes and reach 12 characters."}
        </p>
      </div>
    </div>
  );
}

function SessionsTab() {
  const { refresh } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"one" | "all" | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSessions(await authService.listSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in to load sessions.");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function refreshSessions() {
    setLoading(true);
    try {
      await authService.refreshSession();
      await load();
      toast.success("Session timestamps refreshed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
      setLoading(false);
    }
  }

  async function logoutCurrent() {
    const current = sessions.find((row) => row.current);
    if (current) await authService.revokeSession(current.id);
    else await authService.logout();
    await refresh();
    await load();
    toast.message("Session ended.");
  }

  async function logoutAll() {
    await authService.logoutAll();
    await refresh();
    setSessions([]);
    toast.message("All sessions ended.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void refreshSessions()} disabled={loading}>
          Refresh
        </Button>
        <Button type="button" variant="outline" onClick={() => setConfirm("one")} disabled={sessions.length === 0}>
          Logout
        </Button>
        <Button type="button" variant="destructive" onClick={() => setConfirm("all")} disabled={sessions.length === 0}>
          Logout All Sessions
        </Button>
      </div>
      {loading ? <LoadingState label="Loading sessions…" rows={2} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && sessions.length === 0 ? (
        <EmptyState title="No active sessions" description="Sign in from the Login tab. Sessions are stored in PostgreSQL." />
      ) : null}
      {sessions.length > 0 ? (
        <ul className="grid gap-3">
          {sessions.map((session) => (
            <li key={session.id} className="rounded-xl border border-border bg-card/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs text-muted-foreground">{session.sessionId}</p>
                <div className="flex gap-2">
                  {session.current ? <StatusBadge tone="accent">Current session</StatusBadge> : null}
                  <StatusBadge
                    tone={session.status === "active" ? "success" : session.status === "expiring" ? "warning" : "neutral"}
                  >
                    {session.status}
                  </StatusBadge>
                </div>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Device / browser</dt>
                  <dd>{session.device}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Login time</dt>
                  <dd>{formatDateTime(session.loginTime)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Last activity</dt>
                  <dd>{formatDateTime(session.lastActivity)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Expiration</dt>
                  <dd>{formatDateTime(session.expiresAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Masked IP</dt>
                  <dd className="font-mono">{session.ipAddress}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmationDialog
        open={confirm === "one"}
        onOpenChange={(open) => setConfirm(open ? "one" : null)}
        title="End current session?"
        description="This ends the current demo session on this device."
        confirmLabel="Logout"
        onConfirm={() => {
          void logoutCurrent();
          setConfirm(null);
        }}
      />
      <ConfirmationDialog
        open={confirm === "all"}
        onOpenChange={(open) => setConfirm(open ? "all" : null)}
        title="End all sessions?"
        description="Every demo session listed here will be cleared."
        confirmLabel="Logout all"
        onConfirm={() => {
          void logoutAll();
          setConfirm(null);
        }}
      />
    </div>
  );
}

function SecurityControlsTab() {
  const [checks, setChecks] = useState<SecurityCheck[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    securityService
      .getChecks()
      .then(setChecks)
      .catch((err) => setError(err instanceof Error ? err.message : "Controls unavailable until you sign in."));
  }, []);
  if (error) return <ErrorState message={error} />;
  if (checks.length === 0) return <LoadingState label="Loading live security controls…" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {checks.map((check) => (
        <SecurityCheckCard key={check.id} check={check} />
      ))}
    </div>
  );
}

export function AuthenticationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project 01"
        title="Authentication Toolkit"
        description="Register and sign in against PostgreSQL. Passwords are hashed with Argon2id and never stored in plaintext."
        icon={Fingerprint}
      />
      <Tabs defaultValue="register" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="login">Login</TabsTrigger>
          <TabsTrigger value="strength">Password Strength</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="controls">Security Controls</TabsTrigger>
        </TabsList>
        <TabsContent value="register" className="rounded-xl border border-border bg-card/50 p-4 sm:p-6">
          <RegisterTab />
        </TabsContent>
        <TabsContent value="login" className="rounded-xl border border-border bg-card/50 p-4 sm:p-6">
          <LoginTab />
        </TabsContent>
        <TabsContent value="strength" className="rounded-xl border border-border bg-card/50 p-4 sm:p-6">
          <PasswordStrengthTab />
        </TabsContent>
        <TabsContent value="sessions" className="rounded-xl border border-border bg-card/50 p-4 sm:p-6">
          <SessionsTab />
        </TabsContent>
        <TabsContent value="controls" className="grid gap-3 sm:grid-cols-2">
          <SecurityControlsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
