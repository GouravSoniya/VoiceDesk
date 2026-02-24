import Link from 'next/link'
import { signup } from '../login/actions'
import { SubmitButton } from '../login/submit-button'

export default function Signup({
    searchParams,
}: {
    searchParams: { message: string }
}) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
            {/* Background decorations */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-green-500/20 blur-[120px] pointer-events-none" />

            <Link
                href="/"
                className="absolute left-4 top-4 sm:left-8 sm:top-8 py-2 px-4 rounded-md no-underline text-foreground bg-btn-background hover:bg-btn-background-hover flex items-center group text-sm z-20"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1"
                >
                    <polyline points="15 18 9 12 15 6" />
                </svg>{' '}
                Back
            </Link>

            <div className="flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 z-10">

                <form className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground">
                    <h1 className="text-3xl font-bold mb-4 text-center">Sign up</h1>

                    <label className="text-md" htmlFor="full_name">
                        Full Name
                    </label>
                    <input
                        className="rounded-md px-4 py-2 bg-inherit border mb-6 text-foreground"
                        name="full_name"
                        placeholder="Jane Doe"
                        required
                    />

                    <label className="text-md" htmlFor="email">
                        Email
                    </label>
                    <input
                        className="rounded-md px-4 py-2 bg-inherit border mb-6 text-foreground"
                        name="email"
                        placeholder="you@example.com"
                        required
                    />

                    <label className="text-md" htmlFor="password">
                        Password
                    </label>
                    <input
                        className="rounded-md px-4 py-2 bg-inherit border mb-6 text-foreground"
                        type="password"
                        name="password"
                        placeholder="••••••••"
                        required
                    />

                    <SubmitButton
                        formAction={signup}
                        className="bg-green-700 rounded-md px-4 py-2 text-foreground mb-2"
                        pendingText="Signing Up..."
                    >
                        Sign Up
                    </SubmitButton>
                    <div className="text-center mt-4">
                        <p className="text-sm text-foreground/70">
                            Already have an account?{' '}
                            <Link href="/login" className="text-blue-500 hover:text-blue-400">
                                Log in
                            </Link>
                        </p>
                    </div>
                    {searchParams?.message && (
                        <p className="mt-4 p-4 bg-foreground/10 text-foreground text-center">
                            {searchParams.message}
                        </p>
                    )}
                </form>
            </div>
        </div>
    )
}
