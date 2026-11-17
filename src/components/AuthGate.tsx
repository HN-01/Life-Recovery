import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import { auth, googleProvider } from '../services/firebase';
import { ThemeToggle } from './ui/ThemeToggle';

type AuthMode = 'login' | 'register' | 'reset';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapFirebaseAuthError(err: unknown, context: 'google' | AuthMode): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const message = err instanceof Error ? err.message : '';

  switch (code) {
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Email/Password authentication is currently disabled in Firebase Console. Enable it under Authentication → Sign-in method → Email/Password, or sign in with Google above.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address (for example, name@university.edu).';
    case 'auth/user-not-found':
      return 'No account was found with this email address. Please verify the email or create a new account.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again or use "Forgot password?" to reset it.';
    case 'auth/invalid-credential':
      return 'Incorrect email or password, or this account is not registered yet. Check your details or create a new account.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support or use another account.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead or reset your password.';
    case 'auth/weak-password':
      return 'Password is too weak. Please choose a password with at least 6 characters.';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes before trying again or reset your password.';
    case 'auth/network-request-failed':
      return 'Network error while connecting to Firebase Authentication. Check your connection and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google Sign-In was cancelled before completing.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google Sign-In popup. Allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Console (Authentication → Settings → Authorized domains).';
    default:
      if (message.includes('auth/operation-not-allowed')) {
        return 'Email/Password authentication is currently disabled in Firebase Console. Enable it under Authentication → Sign-in method → Email/Password, or use Google Sign-In above.';
      }
      if (context === 'google') {
        return message || 'Google Sign-In failed. Please try again.';
      }
      return message || 'Authentication failed. Please check your details and try again.';
  }
}

export function AuthGate() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setNotice('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    if (nextMode !== 'register') {
      setConfirmPassword('');
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(mapFirebaseAuthError(err, 'google'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address (for example, name@university.edu).');
      return;
    }

    if (mode !== 'reset') {
      if (!password) {
        setError('Please enter your password.');
        return;
      }
      if (mode === 'register') {
        if (password.length < 6) {
          setError('Password must be at least 6 characters long.');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match. Please re-enter your confirmation password.');
          return;
        }
      }
    }

    setLoading(true);
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, trimmedEmail);
        setNotice(
          'If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.'
        );
      } else if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        if (trimmedName) {
          await updateProfile(cred.user, { displayName: trimmedName });
        }
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      }
    } catch (err) {
      setError(mapFirebaseAuthError(err, mode));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] dark:bg-[#0A0A0C] text-slate-900 dark:text-[#F1F5F9] flex flex-col items-center justify-center p-4 sm:p-6 relative">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle variant="dropdown" />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#111216] border border-slate-200 dark:border-white/10 rounded-xl shadow-xl dark:shadow-2xl overflow-hidden">
        <div className="px-6 sm:px-8 pt-8 pb-6 border-b border-slate-200 dark:border-white/8">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 tracking-wide">
            PROJECT REBUILD ME
          </p>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white mt-1.5">
            {mode === 'login'
              ? 'Sign in to your execution dashboard'
              : mode === 'register'
              ? 'Create your execution account'
              : 'Reset your password'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            Plan your days. Build your discipline. Sync securely across devices.
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          {/* Google Sign-In */}
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-white text-slate-900 border border-slate-300 dark:border-transparent hover:bg-slate-50 dark:hover:bg-slate-100 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors shadow-xs dark:shadow-none"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-200 dark:border-white/10" />
            <span className="shrink mx-3 text-xs text-slate-500">or with email</span>
            <div className="flex-grow border-t border-slate-200 dark:border-white/10" />
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-fullname"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                >
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-fullname"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Haseeb Nawaz"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
                    className="w-full pl-9 pr-11 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-md transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-confirm-password"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pl-9 pr-11 py-2.5 bg-slate-50 dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                    }
                    aria-pressed={showConfirmPassword}
                    title={
                      showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                    }
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-md transition-colors"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="text-xs text-rose-700 dark:text-rose-400 leading-relaxed bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg p-3"
              >
                {error}
              </p>
            )}
            {notice && (
              <p
                role="status"
                className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg p-3"
              >
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition-colors"
            >
              {mode === 'login' && (loading ? 'Signing In...' : 'Sign In')}
              {mode === 'register' && (loading ? 'Creating Account...' : 'Create Account')}
              {mode === 'reset' && (
                <>
                  <KeyRound className="w-4 h-4" />
                  {loading ? 'Sending Reset Link...' : 'Send Reset Link'}
                </>
              )}
              {mode !== 'reset' && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-200 dark:border-white/8 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            {mode === 'login' ? (
              <>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Create new account
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Forgot password?
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Back to Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
